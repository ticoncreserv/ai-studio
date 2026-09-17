import { foldEvents } from "@atelier/domain";
import type { AgentMode, ClientCommand, SessionEvent, Viewport } from "@atelier/contracts";
import type {
  PreviewDebug,
  PreviewTool,
  StudioAttachment,
  StudioAvailableCommand,
  StudioDialog,
  StudioMcp,
  StudioPayload,
  StudioSheet,
  StudioSkill,
} from "~/types/studio";
import {
  hasProgressAfterLastUser,
  mergePendingTurn,
  upsertSessionEvent,
  userMessageCount,
  type PendingUserTurn,
  type QueuedPrompt,
} from "~/utils/chat-events";
import { nextPreviewEventId, shouldReloadPreviewOnCommand, shouldReloadPreviewOnEvent } from "~/utils/preview-reload";
import { insertSlashCommand, mergeSlashCatalog, removeSlashCommand, slashInvocation, slashMatches, slashQuery } from "~/utils/slash";

export function useStudio() {
  const { t, locale, setLocale } = useI18n();
  const route = useRoute();
  const rel = useRelativeTime();
  const workspaceId = computed(() => String(route.params.workspace));

  const data = ref<StudioPayload | null>(null);
  const loadError = ref(false);
  const prompt = ref("");
  const query = ref("");
  const viewport = ref<Viewport>("desktop");
  const rotated = ref(false);
  const dialog = ref<StudioDialog>(null);
  const sheet = ref<StudioSheet>(null);
  const paletteQuery = ref("");
  const mentionsOpen = ref(false);
  const mentionFilter = ref("");
  const slashOpen = ref(false);
  const availableCommands = ref<StudioAvailableCommand[]>([]);
  const spectator = ref(false);
  const toast = ref("");
  const streamingText = ref("");
  const sending = ref(false);
  const pendingTurn = ref<PendingUserTurn | null>(null);
  const queue = ref<QueuedPrompt[]>([]);
  const workingSince = ref<number | null>(null);
  const previewBusy = ref(false);
  const previewKey = ref(0);
  const lastPreviewEventId = ref("");
  const toolMode = ref<PreviewTool>("select");
  const mode = ref<AgentMode>("agent");
  const recipeId = ref("");
  const attachments = ref<StudioAttachment[]>([]);
  const mobileTab = ref<"chat" | "preview">("chat");
  const debugOpen = ref(false);
  const previewDebug = ref<PreviewDebug | null>(null);
  const questionAnswers = ref<Record<string, string[]>>({});

  const events = computed<SessionEvent[]>(() => {
    const persisted = mergePendingTurn((data.value?.events ?? []) as SessionEvent[], pendingTurn.value);
    if (!streamingText.value) return persisted;
    return [
      ...persisted,
      { type: "assistant_delta", id: "live", at: new Date().toISOString(), text: streamingText.value },
    ];
  });
  const showWorking = computed(() => sending.value && !hasProgressAfterLastUser(events.value));
  const failedEventId = computed(() => (pendingTurn.value?.status === "failed" ? pendingTurn.value.id : ""));
  const enterEventId = computed(() => pendingTurn.value?.id ?? "");
  const snapshot = computed(() => foldEvents(events.value));
  const previewSrc = computed(() => data.value?.previewPath ?? "");
  const pendingPlan = computed(() => events.value.find((e) => e.type === "plan" && e.outcome === "pending"));
  const pendingQuestion = computed(() => events.value.find((e) => e.type === "question" && e.outcome === "pending"));
  const pendingPermission = computed(() => events.value.find((e) => e.type === "permission" && e.outcome === "pending"));
  const lastRuntimeError = computed(() => [...events.value].reverse().find((e) => e.type === "runtime_error"));

  function activeSessionId() {
    if (data.value?.session?.id) return data.value.session.id;
    const fromQuery = route.query.session;
    return typeof fromQuery === "string" && fromQuery ? fromQuery : undefined;
  }

  async function refresh() {
    loadError.value = false;
    try {
      data.value = await $fetch<StudioPayload>(`/api/workspace/${workspaceId.value}`, {
        query: { q: query.value || undefined, session: activeSessionId() },
      });
      hydratePresence();
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const disabled = (err as { data?: { disabled?: boolean; message?: string } }).data?.disabled
        || (err as { statusMessage?: string }).statusMessage === "disabled";
      if (status === 403 && disabled) {
        await navigateTo("/disabled");
        return;
      }
      loadError.value = true;
    }
  }

  function hydratePresence() {
    if (!data.value) return;
    const mine = data.value.presence.find((row) => row.userId === data.value?.user.id);
    spectator.value = !data.value.canEdit || mine?.mode === "spectator";
  }

  let socket: WebSocket | null = null;
  function connectSocket() {
    socket?.close();
    const sessionId = data.value?.session?.id;
    if (!sessionId || !import.meta.client) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/_ws?session=${sessionId}`);
    socket.onmessage = (frame) => {
      const event = JSON.parse(String(frame.data)) as SessionEvent;
      ingestSessionEvent(event);
    };
  }

  function onKey(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      dialog.value = dialog.value === "palette" ? null : "palette";
    }
    if (meta && e.key === ".") {
      e.preventDefault();
      void cancelRun();
    }
    if (meta && e.key === "1") viewport.value = "mobile";
    if (meta && e.key === "2") viewport.value = "tablet";
    if (meta && e.key === "3") viewport.value = "desktop";
    if (meta && e.key === "/") {
      e.preventDefault();
      dialog.value = "shortcuts";
    }
    if (e.key === "Escape") {
      slashOpen.value = false;
      dialog.value = null;
      sheet.value = null;
    }
  }

  function onPreviewMessage(e: MessageEvent) {
    const payload = e.data as {
      type?: string;
      source?: string;
      message?: string;
      timeMs?: number;
      queries?: number;
      memoryMb?: number;
      nPlusOne?: boolean;
    };
    if (payload?.type === "atelier-preview-metrics") {
      previewDebug.value = {
        timeMs: payload.timeMs,
        queries: payload.queries,
        memoryMb: payload.memoryMb,
        nPlusOne: payload.nPlusOne,
      };
      return;
    }
    if (payload?.type !== "atelier-preview-error") return;
    void $fetch("/api/errors", {
      method: "POST",
      body: {
        workspaceId: workspaceId.value,
        sessionId: data.value?.session?.id,
        source: payload.source,
        message: payload.message,
      },
    }).then(refresh);
  }

  onMounted(async () => {
    await refresh();
    if (data.value && data.value.workspace.status !== "running") {
      void resume().catch(() => undefined);
    }
    connectSocket();
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onPreviewMessage);
  });

  onBeforeUnmount(() => {
    socket?.close();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("message", onPreviewMessage);
  });

  watch(
    () => data.value?.session?.id,
    () => connectSocket(),
  );

  watch(
    () => userMessageCount((data.value?.events ?? []) as SessionEvent[]),
    (count) => {
      const pending = pendingTurn.value;
      if (pending?.status === "sending" && count >= pending.waitUntilCount) pendingTurn.value = null;
    },
  );

  function ingestSessionEvent(event: SessionEvent) {
    if (event.type === "available_skills") {
      availableCommands.value = event.commands;
      return;
    }
    if (event.type === "assistant_delta") {
      streamingText.value += event.text;
      return;
    }
    streamingText.value = "";
    if (data.value) {
      data.value.events = upsertSessionEvent(data.value.events as SessionEvent[], event);
      if (data.value.session) data.value.session.events = data.value.events;
    }
    if (shouldReloadPreviewOnEvent(event.type) && event.id !== lastPreviewEventId.value) {
      lastPreviewEventId.value = event.id;
      previewKey.value += 1;
    }
    if (event.type === "tool_call" && event.status === "running") return;
    void refresh();
  }

  function persistedUserCount() {
    return userMessageCount((data.value?.events ?? []) as SessionEvent[]);
  }

  function resetComposerFocus() {
    if (!import.meta.client) return;
    void nextTick(() => document.getElementById("composer")?.focus());
  }

  function clearRunState() {
    sending.value = false;
    workingSince.value = null;
    streamingText.value = "";
  }

  let runGeneration = 0;

  async function sendCommand(command: ClientCommand) {
    if (!data.value?.session?.id) return;
    try {
      await $fetch(`/api/sessions/${data.value.session.id}/command`, {
        method: "POST",
        body: { command },
      });
      await refresh();
      const fileEventId = nextPreviewEventId(data.value?.events ?? [], lastPreviewEventId.value);
      if (fileEventId) {
        lastPreviewEventId.value = fileEventId;
        previewKey.value += 1;
      } else if (shouldReloadPreviewOnCommand(command.type)) {
        previewKey.value += 1;
      }
    } catch (error) {
      if (command.type === "prompt") throw error;
      flash(t("chat.promptFailed"));
    }
  }

  type PromptDraft = {
    text: string;
    attachments: string[];
    mentions: string[];
    recipeId?: string;
    skill?: string;
    mode: AgentMode;
  };

  async function submit() {
    if (spectator.value) return;
    const text = prompt.value.trim();
    if (!text && !recipeId.value) return;
    const mentions = [...text.matchAll(/@([\w./-]+)/g)].map((m) => m[1]!);
    const draft: PromptDraft = {
      text,
      attachments: attachments.value.map((file) => file.path),
      mentions,
      recipeId: recipeId.value || undefined,
      skill: slashInvocation(text) ?? undefined,
      mode: mode.value,
    };
    prompt.value = "";
    attachments.value = [];
    recipeId.value = "";
    resetComposerFocus();
    if (sending.value) {
      queue.value = [...queue.value, { id: `queue-${crypto.randomUUID()}`, ...draft }];
      return;
    }
    await runPromptDraft(draft);
  }

  async function runPromptDraft(draft: PromptDraft) {
    const generation = ++runGeneration;
    pendingTurn.value = {
      id: `pending-${crypto.randomUUID()}`,
      text: draft.text,
      at: new Date().toISOString(),
      attachments: draft.attachments,
      mentions: draft.mentions,
      skill: draft.skill,
      waitUntilCount: persistedUserCount() + 1,
      status: "sending",
    };
    sending.value = true;
    workingSince.value = Date.now();
    try {
      await sendCommand({
        type: "prompt",
        text: draft.text,
        attachments: draft.attachments,
        mentions: draft.mentions,
        recipeId: draft.recipeId,
        skill: draft.skill,
        mode: draft.mode,
      });
      if (generation !== runGeneration) return;
      if (pendingTurn.value && persistedUserCount() >= pendingTurn.value.waitUntilCount) {
        pendingTurn.value = null;
      }
    } catch (error) {
      if (generation !== runGeneration) return;
      if (pendingTurn.value) pendingTurn.value = { ...pendingTurn.value, status: "failed" };
      const blocked = (error as { data?: { usageLimit?: boolean } }).data?.usageLimit === true;
      flash(blocked ? t("chat.usageBlocked") : t("chat.promptFailed"));
      if (blocked) void refresh();
    } finally {
      if (generation !== runGeneration) return;
      const next = queue.value[0];
      if (next && pendingTurn.value?.status !== "failed") {
        queue.value = queue.value.slice(1);
        await runPromptDraft(next);
        return;
      }
      sending.value = false;
      if (pendingTurn.value?.status !== "failed") workingSince.value = null;
    }
  }

  async function cancelRun() {
    runGeneration += 1;
    queue.value = [];
    clearRunState();
    await sendCommand({ type: "cancel" });
  }

  function dropQueue() {
    queue.value = [];
  }

  async function retryFailed() {
    const pending = pendingTurn.value;
    if (!pending || pending.status !== "failed") return;
    await runPromptDraft({
      text: pending.text,
      attachments: pending.attachments,
      mentions: pending.mentions,
      skill: pending.skill,
      mode: mode.value,
    });
  }

  const commands = computed(() => [
    { id: "prompt", label: t("command.prompt"), keys: "⌘K", run: () => document.getElementById("composer")?.focus() },
    { id: "cancel", label: t("command.cancel"), keys: "⌘.", run: () => cancelRun() },
    {
      id: "accept",
      label: t("command.acceptHunk"),
      run: () => {
        const hunk = snapshot.value.hunks.find((h) => h.status === "pending");
        if (hunk) void sendCommand({ type: "accept_hunk", hunkId: hunk.id });
      },
    },
    { id: "mobile", label: t("command.viewportMobile"), keys: "⌘1", run: () => (viewport.value = "mobile") },
    { id: "tablet", label: t("command.viewportTablet"), keys: "⌘2", run: () => (viewport.value = "tablet") },
    { id: "desktop", label: t("command.viewportDesktop"), keys: "⌘3", run: () => (viewport.value = "desktop") },
    { id: "tab", label: t("command.openPreview"), run: () => window.open(previewSrc.value, "_blank") },
    {
      id: "restore",
      label: t("command.restore"),
      run: () => {
        const cp = snapshot.value.checkpoints.at(-1);
        if (cp) void sendCommand({ type: "restore_checkpoint", checkpointId: cp.id });
      },
    },
    { id: "new", label: t("command.newSession"), run: newSession },
    { id: "sync", label: t("command.sync"), run: () => sendCommand({ type: "sync_base" }) },
    { id: "discard", label: t("command.discardProposal"), run: () => sendCommand({ type: "discard_proposal" }) },
    { id: "push", label: t("command.push"), run: () => sendCommand({ type: "push_studio" }) },
    { id: "rules", label: t("command.rules"), run: () => (sheet.value = "rules") },
    { id: "skills", label: t("command.skills"), run: () => (sheet.value = "skills") },
    { id: "mcp", label: t("command.mcp"), run: () => (sheet.value = "mcp") },
    { id: "connections", label: t("command.connections"), run: () => (sheet.value = "connections") },
    { id: "settings", label: t("command.settings"), run: () => (sheet.value = "settings") },
    { id: "invite", label: t("command.invite"), run: () => (dialog.value = "invite") },
    { id: "share", label: t("command.share"), run: () => (dialog.value = "share") },
    { id: "shortcuts", label: t("command.shortcuts"), keys: "⌘/", run: () => (dialog.value = "shortcuts") },
  ]);

  const filteredCommands = computed(() =>
    commands.value.filter((c) => c.label.toLowerCase().includes(paletteQuery.value.toLowerCase())),
  );

  function resetConversationUi() {
    runGeneration += 1;
    pendingTurn.value = null;
    queue.value = [];
    availableCommands.value = [];
    clearRunState();
  }

  async function newSession() {
    resetConversationUi();
    const created = await $fetch<{ id: string }>("/api/sessions", {
      method: "POST",
      body: { workspaceId: workspaceId.value, provider: data.value?.preferredProvider ?? data.value?.session?.provider ?? "cursor" },
    });
    if (data.value) data.value.session = { ...(data.value.session as StudioPayload["session"]), ...created, title: "", events: [], provider: data.value.preferredProvider ?? data.value.session?.provider ?? "cursor", createdAt: new Date().toISOString() };
    await refresh();
  }

  async function selectSession(id: string) {
    if (!data.value) return;
    resetConversationUi();
    data.value.session = data.value.sessions.find((s) => s.id === id) ?? data.value.session;
    await refresh();
  }

  async function copyLink(kind: "invite" | "share") {
    const url =
      kind === "invite"
        ? `${location.origin}${(await $fetch<{ url: string }>("/api/invite", { method: "POST" })).url}`
        : `${location.origin}/share/${(await $fetch<{ token: string }>("/api/share", { method: "POST", body: { workspaceId: workspaceId.value } })).token}`;
    await navigator.clipboard.writeText(url);
    flash(t("nav.copied"));
    return url;
  }

  function flash(message: string) {
    toast.value = message;
    setTimeout(() => {
      if (toast.value === message) toast.value = "";
    }, 2400);
  }

  function insertMention(name: string) {
    prompt.value = `${prompt.value.replace(/@[\w./-]*$/, "")}@${name} `;
    mentionsOpen.value = false;
  }

  watch(prompt, (value) => {
    const at = value.lastIndexOf("@");
    mentionsOpen.value = at >= 0 && !value.slice(at).includes(" ");
    mentionFilter.value = at >= 0 ? value.slice(at + 1) : "";
    slashOpen.value = slashQuery(value) !== null;
  });

  const slashQueryText = computed(() => slashQuery(prompt.value));
  const slashHits = computed(() => {
    const queryText = slashQueryText.value;
    if (queryText === null) return [];
    const catalog = data.value?.flags?.skills !== false ? (data.value?.skills ?? []) : [];
    return slashMatches(mergeSlashCatalog(catalog, availableCommands.value), queryText);
  });
  const skillChip = computed(() => slashInvocation(prompt.value));

  function insertSkill(name: string) {
    prompt.value = insertSlashCommand(prompt.value, name);
    slashOpen.value = false;
  }

  function clearSkill() {
    prompt.value = removeSlashCommand(prompt.value, skillChip.value);
  }

  function closeSlash() {
    slashOpen.value = false;
  }

  async function toggleSkill(name: string, enabled: boolean) {
    if (!data.value) return;
    const res = await $fetch<{ skills: StudioSkill[] }>(`/api/workspace/${workspaceId.value}/skills/${encodeURIComponent(name)}`, {
      method: "PATCH",
      body: { enabled },
    });
    data.value.skills = res.skills;
  }

  async function toggleMcp(name: string, enabled: boolean) {
    if (!data.value) return;
    data.value.mcp = await $fetch<StudioMcp>(`/api/workspace/${workspaceId.value}/mcp/${encodeURIComponent(name)}`, {
      method: "PATCH",
      body: { enabled },
    });
  }

  async function saveUserSkill(payload: { name: string; description: string; body: string; paths?: string[]; manualOnly?: boolean }) {
    try {
      await $fetch(`/api/me/skills/${encodeURIComponent(payload.name)}`, { method: "PUT", body: payload });
      await refresh();
      flash(t("skills.saved"));
    } catch (error) {
      flash((error as { statusMessage?: string }).statusMessage || t("admin.error"));
    }
  }

  async function deleteUserSkill(name: string) {
    try {
      await $fetch(`/api/me/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
      await refresh();
      flash(t("skills.deleted"));
    } catch (error) {
      flash((error as { statusMessage?: string }).statusMessage || t("admin.error"));
    }
  }

  async function saveUserMcp(name: string, config: Record<string, unknown>) {
    try {
      await $fetch(`/api/me/mcp/${encodeURIComponent(name)}`, { method: "PUT", body: config });
      await refresh();
      flash(t("mcp.saved"));
    } catch (error) {
      flash((error as { statusMessage?: string }).statusMessage || t("admin.error"));
    }
  }

  async function deleteUserMcp(name: string) {
    try {
      await $fetch(`/api/me/mcp/${encodeURIComponent(name)}`, { method: "DELETE" });
      await refresh();
      flash(t("mcp.deleted"));
    } catch (error) {
      flash((error as { statusMessage?: string }).statusMessage || t("admin.error"));
    }
  }

  const mentionHits = computed(() => {
    const groups = data.value?.mentions;
    if (!groups) return [];
    const q = mentionFilter.value.toLowerCase();
    return [
      ...groups.routes.map((item) => ({ item, kind: "route" as const })),
      ...groups.models.map((item) => ({ item, kind: "model" as const })),
      ...groups.pages.map((item) => ({ item, kind: "page" as const })),
    ].filter((row) => row.item.toLowerCase().includes(q)).slice(0, 10);
  });

  async function attachFiles(files: FileList | File[] | null) {
    if (!files) return;
    for (const file of [...files]) {
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceId", workspaceId.value);
      const res = await $fetch<{ path: string; name: string }>("/api/uploads", { method: "POST", body: form });
      attachments.value.push({ path: res.path, name: res.name });
    }
  }

  async function toggleSpectator() {
    spectator.value = !spectator.value;
    await $fetch("/api/presence", {
      method: "POST",
      body: { workspaceId: workspaceId.value, mode: spectator.value ? "spectator" : "editor" },
    });
    await refresh();
  }

  async function setProvider(provider: string) {
    if (!data.value?.session?.id) return;
    await $fetch(`/api/sessions/${data.value.session.id}`, { method: "PATCH", body: { provider } });
    await refresh();
  }

  async function saveRules() {
    if (!data.value) return;
    await $fetch("/api/rules", {
      method: "PATCH",
      body: { rules: data.value.rules, workspaceId: workspaceId.value },
    });
    flash(t("rules.saved"));
  }

  async function saveUserEnv(payload: { env?: Record<string, string>; raw?: string }) {
    if (!data.value) return;
    data.value.userEnv = await $fetch("/api/me/env", { method: "PUT", body: payload });
    await refresh();
  }

  async function patchFlags(next: Record<string, boolean>) {
    if (!data.value) return;
    data.value.flags = await $fetch("/api/flags", { method: "PATCH", body: next });
  }

  async function hibernate() {
    await $fetch(`/api/workspace/${workspaceId.value}/hibernate`, { method: "POST" });
    await refresh();
  }

  async function resume() {
    previewBusy.value = true;
    try {
      await $fetch(`/api/workspace/${workspaceId.value}/resume`, { method: "POST" });
      await refresh();
      previewKey.value += 1;
    } finally {
      previewBusy.value = false;
    }
  }

  async function signOut() {
    await $fetch("/api/auth/logout", { method: "POST" });
    await navigateTo("/");
  }

  function addPreviewNote(detail: string) {
    prompt.value = prompt.value ? `${prompt.value}\n${detail}` : detail;
    flash(t("preview.pinAdded"));
    mobileTab.value = "chat";
  }

  function statusTone(status: string) {
    if (status === "running") return "live" as const;
    if (status === "hibernated" || status === "error") return "warn" as const;
    return "neutral" as const;
  }

  function statusLabel(status: string) {
    if (status === "running") return t("workspace.live");
    if (status === "hibernated") return t("preview.hibernated");
    if (status === "ready") return t("workspace.ready");
    return status;
  }

  function useSuggestion(text: string) {
    prompt.value = text;
    document.getElementById("composer")?.focus();
  }

  return {
    t,
    locale,
    setLocale,
    rel,
    workspaceId,
    data,
    loadError,
    prompt,
    query,
    viewport,
    rotated,
    dialog,
    sheet,
    paletteQuery,
    mentionsOpen,
    mentionFilter,
    slashOpen,
    slashHits,
    skillChip,
    spectator,
    toast,
    streamingText,
    sending,
    queue,
    workingSince,
    showWorking,
    failedEventId,
    enterEventId,
    previewBusy,
    previewKey,
    toolMode,
    mode,
    recipeId,
    attachments,
    mobileTab,
    debugOpen,
    previewDebug,
    questionAnswers,
    events,
    snapshot,
    previewSrc,
    pendingPlan,
    pendingQuestion,
    pendingPermission,
    lastRuntimeError,
    commands,
    filteredCommands,
    mentionHits,
    insertSkill,
    clearSkill,
    closeSlash,
    toggleSkill,
    toggleMcp,
    saveUserSkill,
    deleteUserSkill,
    saveUserMcp,
    deleteUserMcp,
    refresh,
    sendCommand,
    submit,
    cancelRun,
    dropQueue,
    retryFailed,
    newSession,
    selectSession,
    copyLink,
    insertMention,
    attachFiles,
    toggleSpectator,
    setProvider,
    saveRules,
    saveUserEnv,
    patchFlags,
    hibernate,
    resume,
    signOut,
    addPreviewNote,
    statusTone,
    statusLabel,
    useSuggestion,
    flash,
  };
}
