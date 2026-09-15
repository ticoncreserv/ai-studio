<script setup lang="ts">
import type { ClientCommand, SessionEvent, Viewport } from "@atelier/contracts";
import { foldEvents } from "@atelier/domain";

const { t, locale, setLocale } = useI18n();
const route = useRoute();
const workspaceId = computed(() => String(route.params.workspace));
const rel = useRelativeTime();

const data = ref<any>(null);
const prompt = ref("");
const query = ref("");
const viewport = ref<Viewport>("desktop");
const palette = ref(false);
const paletteQuery = ref("");
const mentionsOpen = ref(false);
const mentionFilter = ref("");
const spectator = ref(false);
const inviteUrl = ref("");
const shareUrl = ref("");
const rulesOpen = ref(false);
const userRule = ref("");
const streamingText = ref("");
const sending = ref(false);

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
const sizes: Record<Viewport, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1112 },
  desktop: { w: 1280, h: 800 },
};

async function refresh() {
  data.value = await $fetch(`/api/workspace/${workspaceId.value}`, {
    query: { q: query.value || undefined, session: data.value?.session?.id },
  });
}

onMounted(async () => {
  await refresh();
  connectSocket();
  window.addEventListener("keydown", onKey);
  window.addEventListener("message", onPreviewMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("message", onPreviewMessage);
});

function connectSocket() {
  const sessionId = data.value?.session?.id;
  if (!sessionId || !import.meta.client) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/_ws?session=${sessionId}`);
  ws.onmessage = (frame) => {
    const event = JSON.parse(String(frame.data)) as SessionEvent;
    if (event.type === "assistant_delta") {
      streamingText.value += event.text;
      return;
    }
    streamingText.value = "";
    void refresh();
  };
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    palette.value = !palette.value;
  }
  if (e.key === "Escape") palette.value = false;
}

function onPreviewMessage(e: MessageEvent) {
  const payload = e.data as { type?: string; source?: string; message?: string };
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

async function sendCommand(command: ClientCommand) {
  if (!data.value?.session?.id) return;
  sending.value = command.type === "prompt";
  try {
    await $fetch(`/api/sessions/${data.value.session.id}/command`, {
      method: "POST",
      body: { command, spectator: spectator.value },
    });
    await refresh();
  } finally {
    sending.value = false;
  }
}

async function submit() {
  const text = prompt.value.trim();
  if (!text) return;
  const mentions = [...text.matchAll(/@([\w./-]+)/g)].map((m) => m[1]!);
  prompt.value = "";
  await sendCommand({ type: "prompt", text, attachments: [], mentions });
}

const commands = computed(() => [
  { id: "prompt", label: t("command.prompt"), run: () => document.getElementById("composer")?.focus() },
  { id: "cancel", label: t("command.cancel"), run: () => sendCommand({ type: "cancel" }) },
  { id: "accept", label: t("command.acceptHunk"), run: () => {
    const hunk = snapshot.value.hunks.find((h) => h.status === "pending");
    if (hunk) void sendCommand({ type: "accept_hunk", hunkId: hunk.id });
  } },
  { id: "mobile", label: t("command.viewportMobile"), run: () => (viewport.value = "mobile") },
  { id: "tablet", label: t("command.viewportTablet"), run: () => (viewport.value = "tablet") },
  { id: "desktop", label: t("command.viewportDesktop"), run: () => (viewport.value = "desktop") },
  { id: "tab", label: t("command.openPreview"), run: () => window.open(previewSrc.value, "_blank") },
  { id: "restore", label: t("command.restore"), run: () => {
    const cp = snapshot.value.checkpoints.at(-1);
    if (cp) void sendCommand({ type: "restore_checkpoint", checkpointId: cp.id });
  } },
  { id: "new", label: t("command.newSession"), run: newSession },
]);

const filteredCommands = computed(() =>
  commands.value.filter((c) => c.label.toLowerCase().includes(paletteQuery.value.toLowerCase())),
);

async function newSession() {
  await $fetch("/api/sessions", { method: "POST", body: { workspaceId: workspaceId.value, provider: "mock" } });
  await refresh();
}

async function invite() {
  const res = await $fetch<{ url: string }>("/api/invite", { method: "POST" });
  inviteUrl.value = `${location.origin}${res.url}`;
}

async function share() {
  const res = await $fetch<{ token: string }>("/api/share", {
    method: "POST",
    body: { workspaceId: workspaceId.value },
  });
  shareUrl.value = `${location.origin}/share/${res.token}`;
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
  const all = [
    ...(data.value?.mentions.routes ?? []),
    ...(data.value?.mentions.models ?? []),
    ...(data.value?.mentions.pages ?? []),
  ] as string[];
  return all.filter((item) => item.toLowerCase().includes(mentionFilter.value.toLowerCase())).slice(0, 8);
});

function frameStyle() {
  const { w, h } = sizes[viewport.value];
  if (viewport.value === "desktop") return { width: "100%", height: "100%" };
  return { width: `${w}px`, height: `${h}px`, maxWidth: "100%" };
}
</script>

<template>
  <div v-if="data" class="grid h-screen grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[280px_minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr]">
    <header class="col-span-full flex flex-wrap items-center gap-3 border-b border-ink-800 px-4 py-2">
      <NuxtLink to="/" class="font-semibold text-white">{{ t("app.name") }}</NuxtLink>
      <UiBadge :tone="data.workspace.status === 'running' ? 'live' : 'warn'">{{ data.workspace.status }}</UiBadge>
      <span class="font-mono text-xs text-ink-500">{{ t("workspace.branch") }} {{ data.workspace.branch }}</span>
      <span class="text-xs text-ink-500">{{ t("workspace.presence", { count: data.presence.length || 1 }) }}</span>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <select
          class="h-8 rounded-md border border-ink-700 bg-ink-900 px-2 text-xs"
          :value="locale"
          @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
        >
          <option value="en">{{ t("auth.english") }}</option>
          <option value="pt-BR">{{ t("auth.portuguese") }}</option>
        </select>
        <label class="flex items-center gap-1 text-xs text-ink-500">
          <input v-model="spectator" type="checkbox" />
          {{ t("workspace.spectator") }}
        </label>
        <UiButton size="sm" variant="ghost" @click="invite">{{ t("nav.invite") }}</UiButton>
        <UiButton size="sm" variant="ghost" @click="share">{{ t("nav.share") }}</UiButton>
        <UiButton size="sm" variant="outline" @click="sendCommand({ type: 'sync_base' })">{{ t("workspace.syncBase") }}</UiButton>
        <UiButton size="sm" variant="outline" @click="$fetch(`/api/workspace/${workspaceId}/hibernate`, { method: 'POST' }).then(refresh)">
          {{ t("workspace.hibernate") }}
        </UiButton>
      </div>
    </header>

    <aside class="hidden border-r border-ink-800 p-3 lg:block">
      <div class="mb-3 flex items-center justify-between">
        <p class="text-xs uppercase tracking-wide text-ink-500">{{ t("nav.sessions") }}</p>
        <UiButton size="sm" variant="ghost" @click="newSession">{{ t("nav.newSession") }}</UiButton>
      </div>
      <UiInput v-model="query" :placeholder="t('nav.search')" @change="refresh" />
      <ul class="mt-3 space-y-1">
        <li v-for="session in data.sessions" :key="session.id">
          <button
            class="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-ink-800"
            :class="session.id === data.session?.id ? 'bg-ink-800 text-white' : 'text-ink-500'"
            @click="data.session = session; refresh()"
          >
            {{ session.title || t("chat.untitled") }}
          </button>
        </li>
      </ul>
      <div class="mt-6 space-y-2 text-xs text-ink-500">
        <p>{{ t("workspace.divergence") }}</p>
        <p>{{ t("workspace.pendingMigrations", { count: data.divergence.pendingInBranch.length }) }}</p>
        <p>{{ t("connections.title") }}</p>
        <p v-for="c in data.connections" :key="c.id">{{ c.name }} · {{ t("connections.homologation") }}</p>
      </div>
      <UiButton class="mt-4" size="sm" variant="ghost" @click="rulesOpen = !rulesOpen">{{ t("nav.rules") }}</UiButton>
      <div v-if="rulesOpen" class="mt-2 space-y-2">
        <p class="text-xs text-ink-500">{{ t("rules.hint") }}</p>
        <textarea v-model="userRule" class="h-24 w-full rounded-md border border-ink-700 bg-ink-900 p-2 text-xs" />
      </div>
      <p v-if="inviteUrl" class="mt-3 break-all text-xs text-copper-400">{{ inviteUrl }}</p>
      <p v-if="shareUrl" class="mt-1 break-all text-xs text-copper-400">{{ shareUrl }}</p>
    </aside>

    <section class="flex min-h-0 flex-col border-r border-ink-800">
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p v-if="!events.length" class="text-sm text-ink-500">{{ t("chat.empty") }}</p>
        <article v-for="event in events" :key="event.id + event.type" class="rounded-lg border border-ink-800 bg-ink-900 p-3 text-sm">
          <p v-if="event.type === 'user_message'" class="whitespace-pre-wrap text-white">{{ event.text }}</p>
          <p v-else-if="event.type === 'assistant_message' || event.type === 'assistant_delta'" class="whitespace-pre-wrap">{{ event.text }}</p>
          <div v-else-if="event.type === 'tool_call'">
            <p class="font-mono text-xs text-copper-400">{{ event.status === 'running' ? t('chat.toolRunning', { name: event.name }) : t('chat.toolDone', { name: event.name }) }}</p>
            <pre v-if="event.output" class="mt-2 overflow-x-auto text-xs text-ink-500">{{ event.output }}</pre>
          </div>
          <div v-else-if="event.type === 'diff'" class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="font-mono text-xs">{{ event.filePath }}</p>
              <div class="flex gap-1">
                <UiButton size="sm" variant="ghost" @click="sendCommand({ type: 'accept_file', filePath: event.filePath })">{{ t("chat.acceptFile") }}</UiButton>
                <UiButton size="sm" variant="ghost" @click="sendCommand({ type: 'reject_file', filePath: event.filePath })">{{ t("chat.rejectFile") }}</UiButton>
              </div>
            </div>
            <div v-for="hunk in event.hunks" :key="hunk.id" class="rounded-md bg-ink-950 p-2">
              <pre class="overflow-x-auto font-mono text-[11px] text-emerald-300">{{ hunk.newLines }}</pre>
              <div class="mt-2 flex gap-1">
                <UiButton size="sm" @click="sendCommand({ type: 'accept_hunk', hunkId: hunk.id })">{{ t("chat.acceptHunk") }}</UiButton>
                <UiButton size="sm" variant="outline" @click="sendCommand({ type: 'reject_hunk', hunkId: hunk.id })">{{ t("chat.rejectHunk") }}</UiButton>
              </div>
            </div>
          </div>
          <div v-else-if="event.type === 'todos'">
            <ul class="space-y-1">
              <li v-for="todo in event.todos" :key="todo.id" class="text-xs">{{ todo.status }} · {{ todo.content }}</li>
            </ul>
          </div>
          <div v-else-if="event.type === 'plan'">
            <p class="mb-2 font-medium">{{ t("chat.planTitle") }}</p>
            <pre class="whitespace-pre-wrap text-xs">{{ event.plan }}</pre>
          </div>
          <div v-else-if="event.type === 'runtime_error'" class="flex items-start justify-between gap-2">
            <p>{{ event.message }}</p>
            <UiButton size="sm" @click="sendCommand({ type: 'fix_error', eventId: event.id })">{{ t("chat.fixThis") }}</UiButton>
          </div>
          <div v-else-if="event.type === 'checkpoint'" class="flex items-center justify-between">
            <p>{{ t("chat.checkpoint") }} · {{ event.label }}</p>
            <UiButton size="sm" variant="ghost" @click="sendCommand({ type: 'restore_checkpoint', checkpointId: event.id })">{{ t("chat.restore") }}</UiButton>
          </div>
          <p v-else-if="event.type === 'dropped_context'" class="text-amber-300">{{ t("chat.droppedContext", { count: event.omitted.length }) }}</p>
          <p v-else-if="event.type === 'budget'" class="text-amber-300">{{ t("chat.budget") }}</p>
          <p v-else-if="event.type === 'conflict'">{{ t("chat.conflict") }} · {{ event.message }}</p>
          <p v-else class="text-xs text-ink-500">{{ event.type }}</p>
          <p class="mt-2 text-[11px] text-ink-500">{{ rel(event.at) }}</p>
        </article>
      </div>

      <form class="relative border-t border-ink-800 p-3" @submit.prevent="submit">
        <div v-if="mentionsOpen" class="absolute inset-x-3 bottom-full mb-1 rounded-md border border-ink-700 bg-ink-900">
          <button
            v-for="item in mentionHits"
            :key="item"
            type="button"
            class="block w-full px-3 py-1.5 text-left text-xs hover:bg-ink-800"
            @click="insertMention(item)"
          >
            {{ item }}
          </button>
        </div>
        <textarea
          id="composer"
          v-model="prompt"
          :disabled="spectator"
          :placeholder="t('chat.placeholder')"
          class="h-24 w-full resize-none rounded-md border border-ink-700 bg-ink-950 p-3 text-sm outline-none focus:border-copper-500"
          @keydown.meta.enter.prevent="submit"
          @keydown.ctrl.enter.prevent="submit"
        />
        <div class="mt-2 flex items-center justify-between">
          <span class="text-xs text-ink-500">{{ spectator ? t("workspace.spectator") : t("chat.modeAgent") }}</span>
          <div class="flex gap-2">
            <UiButton size="sm" variant="ghost" type="button" @click="sendCommand({ type: 'cancel' })">{{ t("chat.cancel") }}</UiButton>
            <UiButton size="sm" :disabled="spectator || sending" type="submit">{{ t("chat.send") }}</UiButton>
          </div>
        </div>
      </form>
    </section>

    <section class="flex min-h-0 flex-col bg-[#0a0b0e]">
      <div class="flex flex-wrap items-center gap-2 border-b border-ink-800 px-3 py-2">
        <p class="text-xs uppercase tracking-wide text-ink-500">{{ t("preview.title") }}</p>
        <UiButton size="sm" variant="ghost" @click="viewport = 'mobile'">{{ t("preview.mobile") }}</UiButton>
        <UiButton size="sm" variant="ghost" @click="viewport = 'tablet'">{{ t("preview.tablet") }}</UiButton>
        <UiButton size="sm" variant="ghost" @click="viewport = 'desktop'">{{ t("preview.desktop") }}</UiButton>
        <a :href="previewSrc" target="_blank" class="text-xs text-copper-400">{{ t("preview.openTab") }}</a>
        <button class="text-xs text-copper-400" @click="window.open(previewSrc, 'atelier-preview', 'noopener,width=1280,height=800')">
          {{ t("preview.openWindow") }}
        </button>
      </div>
      <div class="relative flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[radial-gradient(circle_at_top,#1a1d25,transparent_45%)] p-4">
        <iframe
          v-if="data.workspace.status === 'running'"
          :src="previewSrc"
          :title="t('preview.title')"
          class="rounded-xl border border-ink-700 bg-white shadow-2xl"
          :style="frameStyle()"
        />
        <p v-else-if="data.workspace.status === 'hibernated'" class="text-sm text-ink-500">{{ t("preview.hibernated") }}</p>
        <p v-else class="text-sm text-ink-500">{{ t("preview.booting") }}</p>
        <div class="pointer-events-none absolute bottom-4 right-4 rounded-md bg-ink-900/90 px-3 py-2 text-[11px] text-ink-200">
          {{ t("preview.debugTime", { ms: 42 }) }} · {{ t("preview.debugQueries", { count: 3 }) }} · {{ t("preview.debugMemory", { mb: 28 }) }}
        </div>
      </div>
    </section>

    <div v-if="palette" class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-8" @click.self="palette = false">
      <div class="w-full max-w-lg rounded-xl border border-ink-700 bg-ink-900 p-3 shadow-2xl">
        <UiInput v-model="paletteQuery" :placeholder="t('command.placeholder')" />
        <ul class="mt-2">
          <li v-for="cmd in filteredCommands" :key="cmd.id">
            <button
              class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-ink-800"
              @click="cmd.run(); palette = false"
            >
              {{ cmd.label }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
