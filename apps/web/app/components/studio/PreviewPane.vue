<script setup lang="ts">
import type { Viewport } from "@atelier/contracts";
import type { PreviewDebug, PreviewTool } from "~/types/studio";
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Maximize2,
  MessageCircle,
  Monitor,
  MousePointer2,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Smartphone,
  Tablet,
  Terminal,
} from "@lucide/vue";

const props = defineProps<{
  src: string;
  status: string;
  title: string;
  viewport: Viewport;
  rotated: boolean;
  previewKey: number;
  toolMode: PreviewTool;
  debugOpen: boolean;
  debug?: PreviewDebug | null;
  lastError?: string;
  resuming?: boolean;
}>();

const emit = defineEmits<{
  "update:viewport": [value: Viewport];
  "update:rotated": [value: boolean];
  "update:toolMode": [value: PreviewTool];
  "update:debugOpen": [value: boolean];
  refresh: [];
  note: [text: string];
  resume: [];
  fixDebug: [];
  "toggle-rail": [];
}>();

const { t } = useI18n();

const sizes: Record<Viewport, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1112 },
  desktop: { w: 1280, h: 800 },
};

const frame = computed(() => {
  const { w, h } = sizes[props.viewport];
  const width = props.rotated && props.viewport !== "desktop" ? h : w;
  const height = props.rotated && props.viewport !== "desktop" ? w : h;
  if (props.viewport === "desktop") return { width: "100%", height: "100%", maxWidth: "100%" };
  return {
    width: `min(100%, ${width}px)`,
    height: `min(100%, ${height}px)`,
  };
});

const documentLoaded = ref(false);
const iframeFailed = ref(false);
const docPhase = ref<"boot" | "hydrate" | "nav" | "ready" | null>(null);
const waitClock = ref(0);
const address = ref("");
const addressFocused = ref(false);
const iframeEl = ref<HTMLIFrameElement | null>(null);
let waitTimer: ReturnType<typeof setInterval> | undefined;
let hideStudioOverlay: ReturnType<typeof setTimeout> | undefined;

const waiting = computed(() => {
  if (props.resuming) return true;
  if (props.status === "provisioning" || props.status === "ready") return true;
  if (props.status === "running" && !documentLoaded.value && !iframeFailed.value) return true;
  return false;
});

const waitTitle = computed(() => {
  if (iframeFailed.value) return t("preview.loadFailed");
  if (props.resuming || props.status === "ready") return t("preview.waitResuming");
  if (props.status === "provisioning") return t("preview.waitProvisioning");
  if (docPhase.value === "nav") return t("preview.waitNavigating");
  if (docPhase.value === "hydrate") return t("preview.waitHydrating");
  return t("preview.waitIframe");
});

const waitHint = computed(() => {
  if (iframeFailed.value) return props.lastError || t("preview.loadFailedHint");
  if (props.resuming || props.status === "ready") return t("preview.waitResumingHint");
  if (props.status === "provisioning") return t("preview.waitProvisioningHint");
  if (waitClock.value >= 12) return t("preview.waitSlowDb");
  if (waitClock.value >= 4) return t("preview.waitSlow");
  if (docPhase.value === "hydrate") return t("preview.waitHydratingHint");
  return t("preview.waitIframeHint");
});

const elapsed = computed(() => {
  const seconds = waitClock.value;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});

const liveDot = computed(() => {
  if (props.status === "error" || iframeFailed.value) return "bg-red-400";
  if (props.status === "running" && documentLoaded.value && !props.resuming) return "bg-emerald-400";
  return "bg-amber-400";
});

const port = computed(() => {
  if (!import.meta.client) return "";
  return location.port ? `:${location.port}` : "";
});

const debugSummary = computed(() => {
  const rows: string[] = [];
  if (props.debug?.timeMs != null) rows.push(t("preview.debugTime", { ms: props.debug.timeMs }));
  if (props.debug?.queries != null) rows.push(t("preview.debugQueries", { count: props.debug.queries }));
  return rows.join(" · ");
});

function resetDocument() {
  documentLoaded.value = false;
  iframeFailed.value = false;
  docPhase.value = props.status === "running" ? "boot" : null;
}

function startWaitClock() {
  waitClock.value = 0;
  clearInterval(waitTimer);
  waitTimer = setInterval(() => {
    waitClock.value += 1;
  }, 1000);
}

watch(
  () => [props.src, props.previewKey] as const,
  () => {
    resetDocument();
    if (!addressFocused.value) address.value = props.src;
    if (waiting.value || props.resuming || props.status === "running") startWaitClock();
  },
  { immediate: true },
);

watch(waiting, (busy) => {
  if (busy) startWaitClock();
  else {
    clearInterval(waitTimer);
    waitClock.value = 0;
  }
});

function syncAddress() {
  if (addressFocused.value) return;
  const frameEl = iframeEl.value;
  try {
    const path = frameEl?.contentWindow?.location.pathname;
    const search = frameEl?.contentWindow?.location.search ?? "";
    if (path) address.value = `${path}${search}`;
  } catch {
    /* cross-origin: keep the last known address */
  }
}

function onIframeLoad(event: Event) {
  const frameEl = event.target as HTMLIFrameElement;
  try {
    const href = frameEl.contentDocument?.location.href ?? "";
    if (!href || href === "about:blank") return;
  } catch {
    // cross-origin: treat as delivered
  }
  iframeFailed.value = false;
  documentLoaded.value = true;
  syncAddress();
  if (docPhase.value === "boot" || docPhase.value == null) docPhase.value = "hydrate";
  clearTimeout(hideStudioOverlay);
  hideStudioOverlay = setTimeout(() => {
    if (docPhase.value !== "nav") docPhase.value = "ready";
  }, 12_000);
}

function onIframeError() {
  iframeFailed.value = true;
  documentLoaded.value = false;
}

function onPreviewMessage(event: MessageEvent) {
  const payload = event.data as { type?: string; phase?: string; source?: string };
  if (payload?.source !== "atelier-preview") return;
  if (payload.type === "atelier-preview-loading") {
    documentLoaded.value = true;
    iframeFailed.value = false;
    if (payload.phase === "nav" || payload.phase === "hydrate" || payload.phase === "boot") {
      docPhase.value = payload.phase;
    }
    return;
  }
  if (payload.type === "atelier-preview-ready") {
    documentLoaded.value = true;
    iframeFailed.value = false;
    docPhase.value = "ready";
    syncAddress();
  }
}

onMounted(() => window.addEventListener("message", onPreviewMessage));
onBeforeUnmount(() => {
  window.removeEventListener("message", onPreviewMessage);
  clearInterval(waitTimer);
  clearTimeout(hideStudioOverlay);
});

/* The preview is served from this origin, so the iframe history is reachable. */
function historyGo(delta: number) {
  try {
    iframeEl.value?.contentWindow?.history.go(delta);
  } catch {
    emit("refresh");
  }
}

function navigate() {
  const next = address.value.trim();
  if (!next) {
    address.value = props.src;
    return;
  }
  const target = next.startsWith("/") ? next : `${props.src.replace(/\/$/, "")}/${next}`;
  try {
    iframeEl.value?.contentWindow?.location.assign(target);
    docPhase.value = "nav";
  } catch {
    emit("refresh");
  }
  (document.activeElement as HTMLElement | null)?.blur();
}

function onOverlayClick(e: MouseEvent) {
  if (props.toolMode === "select") return;
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.round(((e.clientX - box.left) / box.width) * 100);
  const y = Math.round(((e.clientY - box.top) / box.height) * 100);
  emit("note", `Preview ${props.toolMode} at ${x}%, ${y}%: `);
}

const showIframe = computed(() => props.status === "running" && !props.resuming);
const showIdlePanel = computed(() => !showIframe.value && !waiting.value);
</script>

<template>
  <section class="relative min-h-0 flex-col border-l border-line bg-surface">
    <div class="flex h-9 shrink-0 items-center gap-1.5 px-2">
      <span class="cx-browser-tab">
        <Globe class="h-3.5 w-3.5 shrink-0 text-ink-500" />
        <span class="min-w-0 truncate font-medium">{{ title }}</span>
        <span class="shrink-0 text-ink-400">{{ port }}</span>
      </span>
      <a :href="src" target="_blank" rel="noreferrer" class="inline-flex">
        <UiIconButton :label="t('preview.openTab')" size="sm">
          <Plus class="h-3.5 w-3.5" />
        </UiIconButton>
      </a>
      <div class="ml-auto flex shrink-0 items-center gap-0.5">
        <a :href="src" target="_blank" rel="noreferrer" class="inline-flex">
          <UiIconButton :label="t('preview.openWindow')" size="sm">
            <Maximize2 class="h-3.5 w-3.5" />
          </UiIconButton>
        </a>
        <UiIconButton :label="t('nav.toggleRail')" size="sm" class="hidden lg:inline-flex" @click="emit('toggle-rail')">
          <PanelRight class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
    </div>

    <div class="flex h-8 shrink-0 items-center gap-1 border-y border-line px-2">
      <UiIconButton :label="t('preview.back')" size="sm" :disabled="!showIframe" @click="historyGo(-1)">
        <ArrowLeft class="h-3.5 w-3.5" />
      </UiIconButton>
      <UiIconButton :label="t('preview.forward')" size="sm" :disabled="!showIframe" @click="historyGo(1)">
        <ArrowRight class="h-3.5 w-3.5" />
      </UiIconButton>
      <UiIconButton :label="t('preview.refresh')" size="sm" :disabled="resuming" @click="emit('refresh')">
        <RefreshCw class="h-3.5 w-3.5" :class="waiting ? 'atelier-spin-icon' : undefined" />
      </UiIconButton>
      <span class="mx-1 h-1.5 w-1.5 shrink-0 rounded-full" :class="liveDot" :title="waiting ? waitTitle : status" />
      <input
        v-model="address"
        class="cx-address font-mono"
        spellcheck="false"
        :placeholder="t('preview.address')"
        :aria-label="t('preview.address')"
        @focus="addressFocused = true"
        @blur="addressFocused = false; syncAddress()"
        @keydown.enter.prevent="navigate"
      />
      <div class="ml-1 flex shrink-0 items-center gap-0.5">
        <UiIconButton :label="t('preview.select')" size="sm" :active="toolMode === 'select'" @click="emit('update:toolMode', 'select')">
          <MousePointer2 class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.annotate')" size="sm" :active="toolMode === 'annotate'" @click="emit('update:toolMode', 'annotate')">
          <Pencil class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.comment')" size="sm" :active="toolMode === 'comment'" @click="emit('update:toolMode', 'comment')">
          <MessageCircle class="h-3.5 w-3.5" />
        </UiIconButton>
        <span class="mx-0.5 hidden h-3.5 w-px bg-white/10 sm:block" />
        <UiIconButton :label="t('preview.mobile')" size="sm" :active="viewport === 'mobile'" @click="emit('update:viewport', 'mobile')">
          <Smartphone class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.tablet')" size="sm" :active="viewport === 'tablet'" @click="emit('update:viewport', 'tablet')">
          <Tablet class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.desktop')" size="sm" :active="viewport === 'desktop'" @click="emit('update:viewport', 'desktop')">
          <Monitor class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton v-if="viewport !== 'desktop'" :label="t('preview.rotate')" size="sm" :active="rotated" @click="emit('update:rotated', !rotated)">
          <RotateCw class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.debugTitle')" size="sm" :active="debugOpen" @click="emit('update:debugOpen', !debugOpen)">
          <Terminal class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
    </div>

    <div
      class="relative flex min-h-0 flex-1 overflow-hidden bg-canvas"
      :class="viewport === 'desktop' ? '' : 'items-center justify-center p-4'"
    >
      <div
        v-if="showIframe"
        class="relative overflow-hidden bg-white"
        :class="viewport === 'desktop' ? 'h-full w-full' : 'rounded-[10px] border border-line-strong'"
        :style="frame"
      >
        <iframe
          :key="previewKey"
          ref="iframeEl"
          :src="src"
          :title="t('preview.title')"
          class="h-full w-full bg-white"
          @load="onIframeLoad"
          @error="onIframeError"
        />
        <div v-if="!documentLoaded || iframeFailed" class="absolute inset-0 z-20 flex items-center justify-center bg-canvas">
          <StudioPreviewWait
            :title="waitTitle"
            :hint="waitHint"
            :elapsed="elapsed"
            :tone="iframeFailed ? 'error' : 'wait'"
          />
        </div>
        <button
          v-if="toolMode !== 'select'"
          type="button"
          class="absolute inset-0 z-10 cursor-crosshair bg-coral-500/8"
          :aria-label="t('preview.inspectHint')"
          @click="onOverlayClick"
        />
      </div>

      <div v-else-if="waiting" class="flex h-full w-full items-center justify-center">
        <StudioPreviewWait :title="waitTitle" :hint="waitHint" :elapsed="elapsed" />
      </div>

      <div v-else-if="showIdlePanel" class="flex h-full w-full items-center justify-center">
        <StudioPreviewWait
          :title="status === 'hibernated' ? t('preview.hibernated') : status === 'error' ? t('preview.error') : t('preview.down')"
          :hint="lastError || t('workspace.resumeHint')"
          tone="error"
        >
          <UiButton class="mt-3" size="sm" @click="emit('resume')">{{ t("workspace.resume") }}</UiButton>
        </StudioPreviewWait>
      </div>

      <div v-if="debugOpen" class="cx-menu absolute right-3 top-3 z-30 w-60 p-3 shadow-float">
        <p class="text-[11px] text-ink-400">{{ t("preview.debugTitle") }}</p>
        <ul v-if="debug && (debug.timeMs != null || debug.queries != null || debug.memoryMb != null)" class="mt-1.5 space-y-1 text-[12px] text-ink-600">
          <li v-if="debug.timeMs != null">{{ t("preview.debugTime", { ms: debug.timeMs }) }}</li>
          <li v-if="debug.queries != null">{{ t("preview.debugQueries", { count: debug.queries }) }}</li>
          <li v-if="debug.memoryMb != null">{{ t("preview.debugMemory", { mb: debug.memoryMb }) }}</li>
          <li v-if="debug.nPlusOne" class="text-amber-200/80">{{ t("preview.nPlusOne") }}</li>
        </ul>
        <p v-else class="mt-1.5 text-[12px] text-ink-500">{{ t("preview.debugEmpty") }}</p>
        <UiButton v-if="debug?.nPlusOne || lastError" class="mt-2.5 w-full" size="sm" variant="outline" @click="emit('fixDebug')">
          {{ t("preview.debugFix") }}
        </UiButton>
      </div>
    </div>

    <div class="cx-footer shrink-0 border-t border-line">
      <span class="truncate">{{ waiting ? waitTitle : debugSummary || t("preview.title") }}</span>
      <span class="ml-auto shrink-0 font-mono">{{ viewport === "desktop" ? t("preview.desktop") : `${rotated ? sizes[viewport].h : sizes[viewport].w}×${rotated ? sizes[viewport].w : sizes[viewport].h}` }}</span>
    </div>
  </section>
</template>
