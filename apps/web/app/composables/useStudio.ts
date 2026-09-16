import { foldEvents } from "@atelier/domain";
import type { AgentMode, ClientCommand, SessionEvent, Viewport } from "@atelier/contracts";
import type { PreviewDebug, PreviewTool, StudioAttachment, StudioDialog, StudioPayload, StudioSheet } from "~/types/studio";

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
  const spectator = ref(false);
  const toast = ref("");
  const streamingText = ref("");
  const sending = ref(false);
  const previewKey = ref(0);
  const toolMode = ref<PreviewTool>("select");
  const mode = ref<AgentMode>("agent");
  const recipeId = ref("");
  const attachments = ref<StudioAttachment[]>([]);
  const mobileTab = ref<"chat" | "preview">("chat");
  const debugOpen = ref(false);
  const previewDebug = ref<PreviewDebug | null>(null);
  const questionAnswers = ref<Record<string, string[]>>({});

  const events = computed<SessionEvent[]>(() => {
    const persisted = (data.value?.events ?? []) as SessionEvent[];
    if (!streamingText.value) return persisted;
    return [
      ...persisted,
      { type: "assistant_delta", id: "live", at: new Date().toISOString(), text: streamingText.value },
    ];
  });
  const snapshot = computed(() => foldEvents(events.value));
  const previewSrc = computed(() => data.value?.previewPath ?? "");
  const pendingPlan = computed(() => events.value.find((e) => e.type === "plan" && e.outcome === "pending"));
  const pendingQuestion = computed(() => events.value.find((e) => e.type === "question" && e.outcome === "pending"));
  const pendingPermission = computed(() => events.value.find((e) => e.type === "permission" && e.outcome === "pending"));
  const lastRuntimeError = computed(() => [...events.value].reverse().find((e) => e.type === "runtime_error"));

  async function refresh() {
    loadError.value = false;
    try {
      data.value = await $fetch<StudioPayload>(`/api/workspace/${workspaceId.value}`, {
        query: { q: query.value || undefined, session: data.value?.session?.id },
      });
      hydratePresence();
    } catch {
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
      if (event.type === "assistant_delta") {
        streamingText.value += event.text;
        return;
      }
      streamingText.value = "";
      if (event.type === "diff" || event.type === "checkpoint" || event.type === "runtime_error") {
        previewKey.value += 1;
      }
      void refresh();
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
      void sendCommand({ type: "cancel" });
    }
    if (meta && e.key === "1") viewport.value = "mobile";
    if (meta && e.key === "2") viewport.value = "tablet";
    if (meta && e.key === "3") viewport.value = "desktop";
    if (meta && e.key === "/") {
      e.preventDefault();
      dialog.value = "shortcuts";
    }
    if (e.key === "Escape") {
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
      try {
        await resume();
      } catch {
        /* preview error is stored on the workspace */
      }
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

  async function sendCommand(command: ClientCommand) {
    if (!data.value?.session?.id) return;
    sending.value = command.type === "prompt";
    try {
      await $fetch(`/api/sessions/${data.value.session.id}/command`, {
        method: "POST",
        body: { command },
      });
      if (command.type === "prompt" || command.type === "accept_hunk" || command.type === "reject_hunk" || command.type === "restore_checkpoint" || command.type === "sync_base") {
        previewKey.value += 1;
      }
      await refresh();
    } catch {
      flash(t("chat.promptFailed"));
    } finally {
      sending.value = false;
    }
  }

  async function submit() {
    const text = prompt.value.trim();
    if (!text && !recipeId.value) return;
    const mentions = [...text.matchAll(/@([\w./-]+)/g)].map((m) => m[1]!);
    prompt.value = "";
    const files = attachments.value.map((a) => a.path);
    attachments.value = [];
    await sendCommand({
      type: "prompt",
      text,
      attachments: files,
      mentions,
      recipeId: recipeId.value || undefined,
      mode: mode.value,
    });
    recipeId.value = "";
  }

  const commands = computed(() => [
    { id: "prompt", label: t("command.prompt"), keys: "⌘K", run: () => document.getElementById("composer")?.focus() },
    { id: "cancel", label: t("command.cancel"), keys: "⌘.", run: () => sendCommand({ type: "cancel" }) },
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
    { id: "rules", label: t("command.rules"), run: () => (sheet.value = "rules") },
    { id: "connections", label: t("command.connections"), run: () => (sheet.value = "connections") },
    { id: "settings", label: t("command.settings"), run: () => (sheet.value = "settings") },
    { id: "invite", label: t("command.invite"), run: () => (dialog.value = "invite") },
    { id: "share", label: t("command.share"), run: () => (dialog.value = "share") },
    { id: "shortcuts", label: t("command.shortcuts"), keys: "⌘/", run: () => (dialog.value = "shortcuts") },
  ]);

  const filteredCommands = computed(() =>
    commands.value.filter((c) => c.label.toLowerCase().includes(paletteQuery.value.toLowerCase())),
  );

  async function newSession() {
    const created = await $fetch<{ id: string }>("/api/sessions", {
      method: "POST",
      body: { workspaceId: workspaceId.value, provider: data.value?.preferredProvider ?? data.value?.session?.provider ?? "cursor" },
    });
    if (data.value) data.value.session = { ...(data.value.session as StudioPayload["session"]), ...created, title: "", events: [], provider: data.value.preferredProvider ?? data.value.session?.provider ?? "cursor", createdAt: new Date().toISOString() };
    await refresh();
  }

  async function selectSession(id: string) {
    if (!data.value) return;
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
  });

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

  async function patchFlags(next: Record<string, boolean>) {
    if (!data.value) return;
    data.value.flags = await $fetch("/api/flags", { method: "PATCH", body: next });
  }

  async function hibernate() {
    await $fetch(`/api/workspace/${workspaceId.value}/hibernate`, { method: "POST" });
    await refresh();
  }

  async function resume() {
    await $fetch(`/api/workspace/${workspaceId.value}/resume`, { method: "POST" });
    await refresh();
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
    spectator,
    toast,
    streamingText,
    sending,
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
    refresh,
    sendCommand,
    submit,
    newSession,
    selectSession,
    copyLink,
    insertMention,
    attachFiles,
    toggleSpectator,
    setProvider,
    saveRules,
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
