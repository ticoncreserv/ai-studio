<script setup lang="ts">
import type { ClientCommand, SessionEvent, Viewport } from "@atelier/contracts";
import { foldEvents } from "@atelier/domain";
import {
  ArrowUp,
  Check,
  Command,
  ExternalLink,
  GitBranch,
  MessageCircle,
  Monitor,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Smartphone,
  MousePointer2,
  Tablet,
  UserPlus,
  X,
} from "lucide-vue-next";

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
const toast = ref("");
const streamingText = ref("");
const sending = ref(false);
const previewKey = ref(0);
const toolMode = ref<"select" | "annotate" | "comment">("select");

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
  mobile: { w: 390, h: 760 },
  tablet: { w: 780, h: 760 },
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

async function copyLink(kind: "invite" | "share") {
  const url =
    kind === "invite"
      ? `${location.origin}${(await $fetch<{ url: string }>("/api/invite", { method: "POST" })).url}`
      : `${location.origin}/share/${(await $fetch<{ token: string }>("/api/share", { method: "POST", body: { workspaceId: workspaceId.value } })).token}`;
  await navigator.clipboard.writeText(url);
  toast.value = t("nav.copied");
  setTimeout(() => (toast.value = ""), 2400);
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
  if (viewport.value === "desktop") return { width: "min(100%, 1100px)", height: "100%" };
  return { width: `min(100%, ${w}px)`, height: `${h}px`, maxHeight: "100%" };
}

function statusTone(status: string) {
  if (status === "running") return "live";
  if (status === "hibernated" || status === "error") return "warn";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "running") return t("workspace.live");
  return status;
}

function initial(login: string) {
  return (login || "s").slice(0, 1).toUpperCase();
}
</script>

<template>
  <div v-if="data" class="flex h-screen flex-col overflow-hidden bg-canvas">
    <header class="flex h-14 shrink-0 items-center gap-3 border-b border-line/80 bg-paper/80 px-4 backdrop-blur-xl">
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <UiLogo :size="28" />
        <span class="hidden text-sm font-semibold tracking-tight sm:block">{{ t("app.name") }}</span>
      </NuxtLink>
      <span class="hidden h-4 w-px bg-line sm:block" />
      <p class="hidden truncate text-sm text-ink-600 md:block">{{ t("workspace.project") }}</p>
      <UiBadge :tone="statusTone(data.workspace.status)">{{ statusLabel(data.workspace.status) }}</UiBadge>
      <span class="hidden items-center gap-1 font-mono text-[11px] text-ink-300 lg:inline-flex">
        <GitBranch class="h-3 w-3" />
        {{ data.workspace.branch }}
      </span>
      <div class="ml-auto flex items-center gap-1.5">
        <div class="hidden items-center -space-x-1.5 sm:flex">
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-ink-950 text-[11px] font-semibold text-white ring-2 ring-paper">
            {{ initial(data.workspace.branch) }}
          </span>
        </div>
        <select
          class="h-8 rounded-full border border-transparent bg-transparent px-2 text-xs text-ink-500 outline-none hover:bg-ink-100"
          :value="locale"
          @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
        >
          <option value="en">{{ t("auth.english") }}</option>
          <option value="pt-BR">{{ t("auth.portuguese") }}</option>
        </select>
        <UiIconButton :label="t('nav.invite')" @click="copyLink('invite')">
          <UserPlus class="h-4 w-4" />
        </UiIconButton>
        <UiButton size="sm" variant="soft" @click="copyLink('share')">
          <Share2 class="h-3.5 w-3.5" />
          {{ t("nav.share") }}
        </UiButton>
      </div>
    </header>

    <div class="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
      <section class="flex min-h-0 flex-col border-r border-line/80 bg-paper">
        <div class="flex items-center gap-2 px-4 pt-4">
          <div class="relative flex-1">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
            <input
              v-model="query"
              :placeholder="t('nav.search')"
              class="h-9 w-full rounded-full border border-line bg-canvas/70 pl-9 pr-3 text-[13px] outline-none placeholder:text-ink-300 focus:border-coral-300"
              @change="refresh"
            />
          </div>
          <UiIconButton :label="t('nav.newSession')" @click="newSession">
            <Plus class="h-4 w-4" />
          </UiIconButton>
        </div>
        <div class="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          <button
            v-for="session in data.sessions"
            :key="session.id"
            class="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition"
            :class="session.id === data.session?.id ? 'bg-ink-950 text-white shadow-lift' : 'bg-ink-100 text-ink-600 hover:bg-ink-100/80'"
            @click="data.session = session; refresh()"
          >
            {{ session.title || t("chat.untitled") }}
          </button>
        </div>

        <div class="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-3">
          <div v-if="!events.length" class="rounded-3xl bg-canvas/80 px-5 py-8 text-center">
            <p class="text-sm leading-relaxed text-ink-500">{{ t("chat.empty") }}</p>
          </div>

          <article v-for="event in events" :key="event.id + event.type">
            <div v-if="event.type === 'user_message'" class="ml-8 rounded-3xl rounded-br-lg bg-ink-950 px-4 py-3 text-[14px] leading-relaxed text-white shadow-lift">
              {{ event.text }}
            </div>
            <div v-else-if="event.type === 'assistant_message' || event.type === 'assistant_delta'" class="mr-4 text-[14px] leading-relaxed text-ink-800">
              {{ event.text }}
            </div>
            <div v-else-if="event.type === 'tool_call'" class="flex items-center gap-2 rounded-2xl border border-line bg-canvas/60 px-3 py-2 text-[12px] text-ink-600">
              <span class="h-1.5 w-1.5 rounded-full" :class="event.status === 'running' ? 'bg-coral-500' : 'bg-emerald-500'" />
              {{ event.status === 'running' ? t('chat.toolRunning', { name: event.name }) : t('chat.toolDone', { name: event.name }) }}
            </div>
            <div v-else-if="event.type === 'diff'" class="overflow-hidden rounded-3xl border border-line bg-white shadow-lift">
              <div class="flex items-center justify-between gap-2 border-b border-line bg-canvas/50 px-3 py-2">
                <p class="truncate font-mono text-[11px] text-ink-600">{{ event.filePath }}</p>
                <div class="flex gap-1">
                  <UiIconButton :label="t('chat.acceptFile')" size="sm" @click="sendCommand({ type: 'accept_file', filePath: event.filePath })">
                    <Check class="h-3.5 w-3.5" />
                  </UiIconButton>
                  <UiIconButton :label="t('chat.rejectFile')" size="sm" @click="sendCommand({ type: 'reject_file', filePath: event.filePath })">
                    <X class="h-3.5 w-3.5" />
                  </UiIconButton>
                </div>
              </div>
              <div v-for="hunk in event.hunks" :key="hunk.id" class="p-2">
                <pre class="max-h-56 overflow-auto rounded-2xl bg-[#161310] p-3 font-mono text-[11px] leading-relaxed text-emerald-300">{{ hunk.newLines }}</pre>
                <div class="mt-2 flex justify-end gap-2">
                  <UiButton size="sm" variant="outline" @click="sendCommand({ type: 'reject_hunk', hunkId: hunk.id })">{{ t("chat.rejectHunk") }}</UiButton>
                  <UiButton size="sm" @click="sendCommand({ type: 'accept_hunk', hunkId: hunk.id })">{{ t("chat.acceptHunk") }}</UiButton>
                </div>
              </div>
            </div>
            <ul v-else-if="event.type === 'todos'" class="space-y-1.5 rounded-2xl bg-canvas/70 px-3 py-3">
              <li v-for="todo in event.todos" :key="todo.id" class="flex items-center gap-2 text-[13px] text-ink-700">
                <span class="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[9px]" :class="todo.status === 'completed' ? 'bg-ink-950 text-white' : ''">
                  <Check v-if="todo.status === 'completed'" class="h-3 w-3" />
                </span>
                {{ todo.content }}
              </li>
            </ul>
            <div v-else-if="event.type === 'runtime_error'" class="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p>{{ event.message }}</p>
              <UiButton size="sm" @click="sendCommand({ type: 'fix_error', eventId: event.id })">{{ t("chat.fixThis") }}</UiButton>
            </div>
            <div v-else-if="event.type === 'checkpoint'" class="flex items-center justify-between text-[12px] text-ink-500">
              <span>{{ t("chat.checkpoint") }} · {{ event.label }}</span>
              <button class="font-medium text-coral-600" @click="sendCommand({ type: 'restore_checkpoint', checkpointId: event.id })">{{ t("chat.restore") }}</button>
            </div>
            <p v-else-if="event.type === 'dropped_context'" class="text-[12px] text-amber-700">{{ t("chat.droppedContext", { count: event.omitted.length }) }}</p>
            <p v-else-if="event.type === 'budget'" class="text-[12px] text-amber-700">{{ t("chat.budget") }}</p>
            <p v-else-if="event.type === 'conflict'" class="text-[12px] text-ink-600">{{ t("chat.conflict") }} · {{ event.message }}</p>
            <p v-else-if="event.type !== 'plan'" class="text-[11px] text-ink-300">{{ rel(event.at) }}</p>
          </article>
        </div>

        <form class="relative p-3" @submit.prevent="submit">
          <div v-if="mentionsOpen" class="absolute inset-x-4 bottom-full z-10 overflow-hidden rounded-2xl border border-line bg-paper shadow-float">
            <button
              v-for="item in mentionHits"
              :key="item"
              type="button"
              class="block w-full px-3 py-2 text-left text-[13px] hover:bg-canvas"
              @click="insertMention(item)"
            >
              {{ item }}
            </button>
          </div>
          <div class="rounded-[26px] border border-line bg-white p-2 shadow-lift">
            <textarea
              id="composer"
              v-model="prompt"
              :disabled="spectator"
              :placeholder="t('chat.placeholder')"
              class="h-20 w-full resize-none bg-transparent px-3 pt-2 text-sm outline-none placeholder:text-ink-300"
              @keydown.meta.enter.prevent="submit"
              @keydown.ctrl.enter.prevent="submit"
            />
            <div class="flex items-center justify-between px-1 pb-1">
              <div class="flex items-center gap-1">
                <UiIconButton :label="t('chat.attach')" size="sm">
                  <Paperclip class="h-4 w-4" />
                </UiIconButton>
                <span class="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600">
                  {{ spectator ? t("workspace.spectator") : t("chat.build") }}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <UiIconButton :label="t('chat.cancel')" size="sm" @click="sendCommand({ type: 'cancel' })">
                  <X class="h-4 w-4" />
                </UiIconButton>
                <button
                  type="submit"
                  :disabled="spectator || sending"
                  class="flex h-9 w-9 items-center justify-center rounded-full bg-coral-500 text-white shadow-glow transition hover:bg-coral-400 disabled:opacity-40"
                  :aria-label="t('chat.send')"
                >
                  <ArrowUp class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      <section class="relative flex min-h-0 flex-col">
        <div class="flex h-12 items-center gap-2 px-4">
          <div class="flex rounded-full bg-white/80 p-1 shadow-inset">
            <UiIconButton :label="t('preview.mobile')" size="sm" :active="viewport === 'mobile'" @click="viewport = 'mobile'">
              <Smartphone class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton :label="t('preview.tablet')" size="sm" :active="viewport === 'tablet'" @click="viewport = 'tablet'">
              <Tablet class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton :label="t('preview.desktop')" size="sm" :active="viewport === 'desktop'" @click="viewport = 'desktop'">
              <Monitor class="h-3.5 w-3.5" />
            </UiIconButton>
          </div>
          <span class="rounded-full bg-white/70 px-3 py-1 text-[12px] font-medium text-ink-600">{{ t("preview.home") }}</span>
          <div class="ml-auto flex items-center gap-1">
            <UiIconButton :label="t('preview.refresh')" @click="previewKey += 1">
              <RefreshCw class="h-4 w-4" />
            </UiIconButton>
            <a :href="previewSrc" target="_blank">
              <UiIconButton :label="t('preview.openTab')">
                <ExternalLink class="h-4 w-4" />
              </UiIconButton>
            </a>
          </div>
        </div>

        <div class="preview-dots relative mx-3 mb-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[28px] border border-line/70 bg-[#efe8df]">
          <iframe
            v-if="data.workspace.status === 'running'"
            :key="previewKey"
            :src="previewSrc"
            :title="t('preview.title')"
            class="rounded-[22px] bg-white shadow-float"
            :style="frameStyle()"
          />
          <p v-else-if="data.workspace.status === 'hibernated'" class="text-sm text-ink-500">{{ t("preview.hibernated") }}</p>
          <p v-else class="text-sm text-ink-500">{{ t("preview.booting") }}</p>

          <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/70 bg-white/90 p-1 shadow-float backdrop-blur">
            <UiIconButton :label="t('preview.select')" size="sm" :active="toolMode === 'select'" @click="toolMode = 'select'">
              <MousePointer2 class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton :label="t('preview.annotate')" size="sm" :active="toolMode === 'annotate'" @click="toolMode = 'annotate'">
              <Pencil class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton :label="t('preview.comment')" size="sm" :active="toolMode === 'comment'" @click="toolMode = 'comment'">
              <MessageCircle class="h-3.5 w-3.5" />
            </UiIconButton>
          </div>
          <div class="pointer-events-none absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-ink-600 shadow-lift">
            {{ t("preview.debugTime", { ms: 42 }) }} · {{ t("preview.debugQueries", { count: 3 }) }}
          </div>
        </div>
      </section>
    </div>

    <div v-if="toast" class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-950 px-4 py-2 text-[13px] font-medium text-white shadow-float">
      {{ toast }}
    </div>

    <div v-if="palette" class="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/30 p-8 backdrop-blur-sm" @click.self="palette = false">
      <div class="w-full max-w-lg overflow-hidden rounded-[28px] border border-line bg-paper p-3 shadow-float">
        <div class="flex items-center gap-2 px-2">
          <Command class="h-4 w-4 text-ink-300" />
          <input
            v-model="paletteQuery"
            :placeholder="t('command.placeholder')"
            class="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-300"
          />
        </div>
        <ul class="mt-1">
          <li v-for="cmd in filteredCommands" :key="cmd.id">
            <button
              class="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-canvas"
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
