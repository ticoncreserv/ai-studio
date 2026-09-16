<script setup lang="ts">
import type { Viewport } from "@atelier/contracts";
import type { PreviewDebug, PreviewTool } from "~/types/studio";
import {
  ExternalLink,
  MessageCircle,
  Monitor,
  MousePointer2,
  Pencil,
  RefreshCw,
  RotateCw,
  Smartphone,
  Tablet,
} from "@lucide/vue";

const props = defineProps<{
  src: string;
  status: string;
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
    width: `min(100%, ${Math.round(width * 0.72)}px)`,
    height: `min(100%, ${Math.round(height * 0.72)}px)`,
  };
});

const documentLoaded = ref(false);
const iframeFailed = ref(false);
const docPhase = ref<"boot" | "hydrate" | "nav" | "ready" | null>(null);
const waitClock = ref(0);
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

const addressLabel = computed(() => {
  if (waiting.value) return waitTitle.value;
  if (props.status === "running") return props.src || t("preview.home");
  return props.src || t("preview.home");
});

const liveDot = computed(() => {
  if (props.status === "error" || iframeFailed.value) return "bg-red-400";
  if (props.status === "running" && documentLoaded.value && !props.resuming) return "bg-emerald-400 pulse-dot";
  return "bg-amber-400";
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
  () => [props.src, props.previewKey, props.status, props.resuming] as const,
  () => {
    resetDocument();
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

function onIframeLoad(event: Event) {
  const frame = event.target as HTMLIFrameElement;
  try {
    const href = frame.contentDocument?.location.href ?? "";
    if (!href || href === "about:blank") return;
  } catch {
    // cross-origin: treat as delivered
  }
  iframeFailed.value = false;
  documentLoaded.value = true;
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
  }
}

onMounted(() => window.addEventListener("message", onPreviewMessage));
onBeforeUnmount(() => {
  window.removeEventListener("message", onPreviewMessage);
  clearInterval(waitTimer);
  clearTimeout(hideStudioOverlay);
});

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
  <section class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 items-center gap-2 border-b border-line px-3">
      <div class="flex rounded-[9px] bg-white/5 p-0.5">
        <UiIconButton :label="t('preview.mobile')" size="sm" :active="viewport === 'mobile'" @click="emit('update:viewport', 'mobile')">
          <Smartphone class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.tablet')" size="sm" :active="viewport === 'tablet'" @click="emit('update:viewport', 'tablet')">
          <Tablet class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.desktop')" size="sm" :active="viewport === 'desktop'" @click="emit('update:viewport', 'desktop')">
          <Monitor class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
      <div class="hidden min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-line bg-black/30 px-3 py-1 text-[12px] text-ink-500 sm:flex">
        <span class="h-1.5 w-1.5 rounded-full" :class="liveDot" />
        <span class="truncate font-mono text-[11px]" :title="t('preview.address')">{{ addressLabel }}</span>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <UiIconButton v-if="viewport !== 'desktop'" :label="t('preview.rotate')" @click="emit('update:rotated', !rotated)">
          <RotateCw class="h-4 w-4" />
        </UiIconButton>
        <UiIconButton :label="t('preview.refresh')" :disabled="resuming" @click="emit('refresh')">
          <RefreshCw class="h-4 w-4" :class="waiting ? 'atelier-spin-icon' : undefined" />
        </UiIconButton>
        <a :href="src" target="_blank">
          <UiIconButton :label="t('preview.openTab')">
            <ExternalLink class="h-4 w-4" />
          </UiIconButton>
        </a>
      </div>
    </div>

    <div class="preview-dots relative m-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line">
      <div
        v-if="showIframe"
        class="relative overflow-hidden bg-white shadow-float"
        :class="viewport === 'desktop' ? 'h-full w-full rounded-[10px]' : 'rounded-[28px] border-[8px] border-black'"
        :style="frame"
      >
        <div v-if="viewport !== 'desktop'" class="absolute left-1/2 top-2 z-10 h-3 w-16 -translate-x-1/2 rounded-full bg-black/70" />
        <iframe
          :key="previewKey"
          :src="src"
          :title="t('preview.title')"
          class="h-full w-full bg-white"
          @load="onIframeLoad"
          @error="onIframeError"
        />
        <div
          v-if="!documentLoaded || iframeFailed"
          class="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0d13]/95"
        >
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
          class="absolute inset-0 z-10 cursor-crosshair bg-coral-500/10"
          :aria-label="t('preview.inspectHint')"
          @click="onOverlayClick"
        />
      </div>

      <div v-else-if="waiting" class="z-10">
        <StudioPreviewWait :title="waitTitle" :hint="waitHint" :elapsed="elapsed" />
      </div>

      <div v-else-if="showIdlePanel" class="z-10">
        <StudioPreviewWait
          :title="status === 'hibernated' ? t('preview.hibernated') : status === 'error' ? t('preview.error') : t('preview.down')"
          :hint="lastError || t('workspace.resumeHint')"
          tone="error"
        >
          <UiButton class="mt-4" size="sm" @click="emit('resume')">{{ t("workspace.resume") }}</UiButton>
        </StudioPreviewWait>
      </div>

      <div class="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-[11px] border border-line bg-black/45 p-1 shadow-float backdrop-blur-xl">
        <UiIconButton :label="t('preview.select')" size="sm" :active="toolMode === 'select'" @click="emit('update:toolMode', 'select')">
          <MousePointer2 class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.annotate')" size="sm" :active="toolMode === 'annotate'" @click="emit('update:toolMode', 'annotate')">
          <Pencil class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.comment')" size="sm" :active="toolMode === 'comment'" @click="emit('update:toolMode', 'comment')">
          <MessageCircle class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>

      <button
        type="button"
        class="absolute right-4 top-4 z-20 rounded-[9px] border border-line bg-black/45 px-3 py-1.5 text-[11px] font-medium text-ink-800 backdrop-blur-xl"
        @click="emit('update:debugOpen', !debugOpen)"
      >
        {{ debug?.timeMs != null ? t("preview.debugTime", { ms: debug.timeMs }) : t("preview.debugTitle") }}
        <template v-if="debug?.queries != null"> · {{ t("preview.debugQueries", { count: debug.queries }) }}</template>
      </button>

      <div v-if="debugOpen" class="glass-window absolute right-4 top-14 z-20 w-64 p-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("preview.debugTitle") }}</p>
        <ul v-if="debug && (debug.timeMs != null || debug.queries != null || debug.memoryMb != null)" class="mt-2 space-y-1 text-[12px] text-ink-600">
          <li v-if="debug.timeMs != null">{{ t("preview.debugTime", { ms: debug.timeMs }) }}</li>
          <li v-if="debug.queries != null">{{ t("preview.debugQueries", { count: debug.queries }) }}</li>
          <li v-if="debug.memoryMb != null">{{ t("preview.debugMemory", { mb: debug.memoryMb }) }}</li>
          <li v-if="debug.nPlusOne" class="text-amber-200">{{ t("preview.nPlusOne") }}</li>
        </ul>
        <p v-else class="mt-2 text-[12px] text-ink-500">{{ t("preview.debugEmpty") }}</p>
        <UiButton v-if="debug?.nPlusOne || lastError" class="mt-3 w-full" size="sm" @click="emit('fixDebug')">{{ t("preview.debugFix") }}</UiButton>
      </div>
    </div>
  </section>
</template>
