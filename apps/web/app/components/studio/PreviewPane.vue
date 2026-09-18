<script setup lang="ts">
import type { Viewport } from "@atelier/contracts";
import type { PreviewDebug, PreviewTool } from "~/types/studio";
import { previewUnavailableFromDocument, type PreviewFrameUnavailable } from "~/utils/preview-frame-state";
import {
  describeInspectElement,
  elementsInInspectRect,
  hitInspectElement,
  inspectLabel,
  inspectTooltipPosition,
  type PreviewInspectTarget,
} from "~/utils/preview-inspect";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Globe,
  ExternalLink,
  Scan,
  Monitor,
  Moon,
  MousePointer2,
  PanelRight,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Smartphone,
  Tablet,
  X,
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
  canEdit?: boolean;
  canHibernate?: boolean;
  processRunning?: boolean;
}>();

const emit = defineEmits<{
  "update:viewport": [value: Viewport];
  "update:rotated": [value: boolean];
  "update:toolMode": [value: PreviewTool];
  "update:debugOpen": [value: boolean];
  refresh: [];
  pin: [targets: PreviewInspectTarget[]];
  resume: [];
  hibernate: [];
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
const iframeByTab = new Map<string, HTMLIFrameElement>();
let waitTimer: ReturnType<typeof setInterval> | undefined;
let hideStudioOverlay: ReturnType<typeof setTimeout> | undefined;
let tabSeq = 0;

type PreviewBrowserTab = {
  id: string;
  src: string;
  title: string;
  frameKey: number;
  loaded: boolean;
  failed: boolean;
  unavailable: PreviewFrameUnavailable | null;
};

const tabs = ref<PreviewBrowserTab[]>([]);
const activeTabId = ref("");

function makeTab(src: string, title: string): PreviewBrowserTab {
  tabSeq += 1;
  return { id: `preview-tab-${tabSeq}`, src, title, frameKey: 0, loaded: false, failed: false, unavailable: null };
}

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? tabs.value[0] ?? null);

function bindIframe(id: string, el: unknown) {
  if (el instanceof HTMLIFrameElement) {
    iframeByTab.set(id, el);
    syncFrameState(id, el);
  } else iframeByTab.delete(id);
}

function applyTabChrome(tab: PreviewBrowserTab | null) {
  documentLoaded.value = Boolean(tab?.loaded);
  iframeFailed.value = Boolean(tab?.failed);
}

function syncFrameState(id: string, frameEl: HTMLIFrameElement) {
  const tab = tabs.value.find((row) => row.id === id);
  if (!tab) return;
  try {
    const href = frameEl.contentDocument?.location.href ?? "";
    if (!href || href === "about:blank") return;
  } catch {
    if (id === activeTabId.value) {
      tab.loaded = true;
      tab.failed = false;
      tab.unavailable = null;
      applyTabChrome(tab);
    }
    return;
  }
  const unavailable = previewUnavailableFromDocument(frameEl.contentDocument);
  tab.unavailable = unavailable;
  tab.loaded = !unavailable;
  tab.failed = false;
  if (id === activeTabId.value) {
    applyTabChrome(tab);
    if (unavailable) docPhase.value = null;
    else syncAddress();
  }
}

function activeFrame(): HTMLIFrameElement | null {
  const bound = iframeByTab.get(activeTabId.value);
  if (bound) return bound;
  if (!import.meta.client) return null;
  return (
    [...document.querySelectorAll("iframe.preview")].find((node): node is HTMLIFrameElement => {
      return node instanceof HTMLIFrameElement && node.style.display !== "none";
    }) ?? null
  );
}

const tabUnavailable = computed(() => activeTab.value?.unavailable ?? null);
const processUp = computed(
  () => props.status === "running" && !props.resuming && props.processRunning !== false,
);
const previewAwake = computed(() => processUp.value && !tabUnavailable.value);

const waiting = computed(() => {
  if (props.resuming) return true;
  if (props.status === "provisioning" || props.status === "ready") return true;
  const tab = activeTab.value;
  if (tab?.unavailable) return false;
  if (processUp.value && tab && !tab.loaded && !tab.failed) return true;
  return false;
});

const waitTitle = computed(() => {
  if (props.resuming || props.status === "ready") return t("preview.waitResuming");
  if (props.status === "provisioning") return t("preview.waitProvisioning");
  if (tabUnavailable.value === "hibernated") return t("preview.hibernated");
  if (tabUnavailable.value === "missing") return t("preview.notFound");
  if (tabUnavailable.value === "down") return t("preview.down");
  if (iframeFailed.value) return t("preview.loadFailed");
  if (docPhase.value === "nav") return t("preview.waitNavigating");
  if (docPhase.value === "hydrate") return t("preview.waitHydrating");
  return t("preview.waitIframe");
});

const waitHint = computed(() => {
  if (props.resuming || props.status === "ready") return t("preview.waitResumingHint");
  if (props.status === "provisioning") return t("preview.waitProvisioningHint");
  if (tabUnavailable.value) return props.lastError || t("workspace.resumeHint");
  if (iframeFailed.value) return props.lastError || t("preview.loadFailedHint");
  return t("preview.waitIframeHint");
});

const waitTone = computed(() => {
  if (props.resuming || props.status === "ready" || props.status === "provisioning") return "wait";
  if (tabUnavailable.value || iframeFailed.value) return "error";
  return "wait";
});
const idleTitle = computed(() => {
  if (props.status === "error") return t("preview.error");
  if (props.status === "hibernated" || props.processRunning === false || tabUnavailable.value === "hibernated") {
    return t("preview.hibernated");
  }
  return t("preview.down");
});

const elapsed = computed(() => {
  const seconds = waitClock.value;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});

const liveDot = computed(() => {
  if (props.status === "error" || iframeFailed.value || tabUnavailable.value === "down" || tabUnavailable.value === "missing") {
    return "bg-red-400";
  }
  if (tabUnavailable.value === "hibernated") return "bg-amber-400";
  if (previewAwake.value && documentLoaded.value) return "bg-emerald-400";
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
  docPhase.value = processUp.value ? "boot" : null;
}

function startWaitClock() {
  waitClock.value = 0;
  clearInterval(waitTimer);
  waitTimer = setInterval(() => {
    waitClock.value += 1;
  }, 1000);
}

watch(
  () => props.src,
  (src) => {
    iframeByTab.clear();
    if (!src) {
      tabs.value = [];
      activeTabId.value = "";
      return;
    }
    const tab = makeTab(src, props.title);
    tabs.value = [tab];
    activeTabId.value = tab.id;
    resetDocument();
    if (!addressFocused.value) address.value = src;
    if (waiting.value || props.resuming || props.status === "running") startWaitClock();
  },
  { immediate: true },
);

watch(
  () => props.title,
  (title) => {
    const home = tabs.value[0];
    if (home) home.title = title;
  },
);

watch(
  () => props.previewKey,
  () => {
    const tab = activeTab.value;
    if (!tab) return;
    tab.frameKey += 1;
    tab.loaded = false;
    tab.failed = false;
    tab.unavailable = null;
    resetDocument();
  },
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
  const frameEl = activeFrame();
  try {
    const path = frameEl?.contentWindow?.location.pathname;
    const search = frameEl?.contentWindow?.location.search ?? "";
    if (path) {
      address.value = `${path}${search}`;
      const tab = activeTab.value;
      if (tab && tabs.value.length > 1) {
        const leaf = path.split("/").filter(Boolean).at(-1);
        tab.title = leaf || t("preview.newTab");
      }
    }
  } catch {
    /* cross-origin: keep the last known address */
  }
}

function onIframeLoad(event: Event) {
  const frameEl = event.target as HTMLIFrameElement;
  const tabId = [...iframeByTab.entries()].find(([, node]) => node === frameEl)?.[0] ?? activeTabId.value;
  if (!tabId) return;
  iframeByTab.set(tabId, frameEl);
  syncFrameState(tabId, frameEl);
  const tab = tabs.value.find((row) => row.id === tabId);
  if (!tab || tab.unavailable || tab.id !== activeTabId.value) return;
  if (docPhase.value === "boot" || docPhase.value == null) docPhase.value = "hydrate";
  clearTimeout(hideStudioOverlay);
  hideStudioOverlay = setTimeout(() => {
    if (docPhase.value !== "nav") docPhase.value = "ready";
  }, 12_000);
}

function onIframeError(event: Event) {
  const frameEl = event.target as HTMLIFrameElement;
  const tab = tabs.value.find((row) => iframeByTab.get(row.id) === frameEl);
  if (tab) {
    tab.loaded = false;
    tab.failed = true;
    tab.unavailable = null;
  }
  if (tab && tab.id !== activeTabId.value) return;
  iframeFailed.value = true;
  documentLoaded.value = false;
}

function onPreviewMessage(event: MessageEvent) {
  const payload = event.data as { type?: string; phase?: string; source?: string };
  if (payload?.source !== "atelier-preview") return;
  if (payload.type === "atelier-preview-loading") {
    documentLoaded.value = true;
    iframeFailed.value = false;
    if (activeTab.value) {
      activeTab.value.loaded = true;
      activeTab.value.failed = false;
      activeTab.value.unavailable = null;
    }
    if (payload.phase === "nav" || payload.phase === "hydrate" || payload.phase === "boot") {
      docPhase.value = payload.phase;
    }
    return;
  }
  if (payload.type === "atelier-preview-ready") {
    documentLoaded.value = true;
    iframeFailed.value = false;
    if (activeTab.value) {
      activeTab.value.loaded = true;
      activeTab.value.failed = false;
      activeTab.value.unavailable = null;
    }
    docPhase.value = "ready";
    syncAddress();
  }
}

onMounted(() => window.addEventListener("message", onPreviewMessage));
onBeforeUnmount(() => {
  window.removeEventListener("message", onPreviewMessage);
  window.removeEventListener("mouseup", onInspectUp);
  clearInterval(waitTimer);
  clearTimeout(hideStudioOverlay);
});

/* The preview is served from this origin, so the iframe history is reachable. */
function historyGo(delta: number) {
  try {
    activeFrame()?.contentWindow?.history.go(delta);
  } catch {
    emit("refresh");
  }
}

function navigate() {
  const next = address.value.trim();
  if (!next) {
    address.value = activeTab.value?.src || props.src;
    return;
  }
  const root = (activeTab.value?.src || props.src).replace(/\/$/, "");
  const target = next.startsWith("/") ? next : `${root}/${next}`;
  try {
    activeFrame()?.contentWindow?.location.assign(target);
    docPhase.value = "nav";
  } catch {
    emit("refresh");
  }
  (document.activeElement as HTMLElement | null)?.blur();
}

function selectTab(id: string) {
  if (id === activeTabId.value) return;
  activeTabId.value = id;
  addressFocused.value = false;
  const tab = tabs.value.find((row) => row.id === id);
  applyTabChrome(tab ?? null);
  syncAddress();
}

function addTab() {
  if (!props.src) return;
  const tab = makeTab(props.src, t("preview.newTab"));
  tabs.value = [...tabs.value, tab];
  activeTabId.value = tab.id;
  address.value = props.src;
  documentLoaded.value = false;
  iframeFailed.value = false;
}

function closeTab(id: string) {
  if (tabs.value.length < 2) return;
  const index = tabs.value.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  iframeByTab.delete(id);
  const next = tabs.value.filter((tab) => tab.id !== id);
  tabs.value = next;
  if (activeTabId.value === id) {
    const neighbor = next[Math.max(0, index - 1)] ?? next[0];
    if (neighbor) selectTab(neighbor.id);
  }
}

function browserUrl(): string {
  const path = address.value.trim() || props.src;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${location.origin}${path}`;
  return props.src;
}

type InspectBox = { left: number; top: number; width: number; height: number };

const inspectBox = ref<InspectBox | null>(null);
const inspectCaption = ref("");
const dragOrigin = ref<{ x: number; y: number } | null>(null);
const dragBox = ref<InspectBox | null>(null);
const inspectTooltip = computed(() => (inspectBox.value ? inspectTooltipPosition(inspectBox.value) : null));

function iframePoint(e: MouseEvent): { x: number; y: number; doc: Document } | null {
  const frameEl = activeFrame();
  if (!frameEl) return null;
  let doc: Document | null = null;
  try {
    doc = frameEl.contentDocument;
  } catch {
    return null;
  }
  if (!doc) return null;
  const rect = frameEl.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, doc };
}

function boxFromElement(el: Element): InspectBox {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function highlightElement(el: Element | null) {
  if (!el || el.tagName === "HTML" || el.tagName === "BODY") {
    inspectBox.value = null;
    inspectCaption.value = "";
    return;
  }
  inspectBox.value = boxFromElement(el);
  inspectCaption.value = inspectLabel(describeInspectElement(el));
}

function onInspectMove(e: MouseEvent) {
  if (props.toolMode === "select") return;
  if (dragOrigin.value) {
    const origin = dragOrigin.value;
    const hit = iframePoint(e);
    if (!hit) return;
    const left = Math.min(origin.x, hit.x);
    const top = Math.min(origin.y, hit.y);
    dragBox.value = {
      left,
      top,
      width: Math.abs(hit.x - origin.x),
      height: Math.abs(hit.y - origin.y),
    };
    inspectCaption.value = "";
    return;
  }
  const hit = iframePoint(e);
  highlightElement(hit ? hitInspectElement(hit.doc, hit.x, hit.y) : null);
}

function clearInspect() {
  if (dragOrigin.value) return;
  inspectBox.value = null;
  inspectCaption.value = "";
  dragBox.value = null;
}

function pagePath(): string | undefined {
  try {
    return activeFrame()?.contentWindow?.location.pathname;
  } catch {
    return undefined;
  }
}

function pinElement(el: Element) {
  if (el.tagName === "HTML" || el.tagName === "BODY") return;
  if (props.toolMode === "select") return;
  emit("pin", [describeInspectElement(el, pagePath())]);
}

function onInspectDown(e: MouseEvent) {
  if (props.toolMode === "select" || e.button !== 0) return;
  e.preventDefault();
  const hit = iframePoint(e);
  if (!hit) return;
  dragOrigin.value = { x: hit.x, y: hit.y };
  dragBox.value = null;
  window.addEventListener("mouseup", onInspectUp, { once: true });
}

function onInspectUp(e: MouseEvent) {
  if (props.toolMode === "select") return;
  dragOrigin.value = null;
  const drag = dragBox.value;
  dragBox.value = null;
  const hit = iframePoint(e);
  if (!hit) return;
  const dragged = Boolean(drag && (drag.width > 8 || drag.height > 8));
  if (dragged && drag) {
    const nodes = elementsInInspectRect(hit.doc, {
      left: drag.left,
      top: drag.top,
      right: drag.left + drag.width,
      bottom: drag.top + drag.height,
    });
    const targets = nodes.map((node) => describeInspectElement(node, pagePath()));
    if (targets.length) emit("pin", targets);
    highlightElement(null);
    return;
  }
  const el = hitInspectElement(hit.doc, hit.x, hit.y);
  if (el) pinElement(el);
  highlightElement(el);
}

watch(
  () => props.toolMode,
  () => {
    dragOrigin.value = null;
    dragBox.value = null;
    inspectBox.value = null;
    inspectCaption.value = "";
  },
);

const showIframe = computed(() => processUp.value);
const showIdlePanel = computed(() => !showIframe.value && !waiting.value);
const powerDisabled = computed(() => {
  if (props.resuming || props.status === "provisioning") return true;
  if (previewAwake.value && (props.canHibernate ?? props.canEdit) === false) return true;
  if (!previewAwake.value && props.canEdit === false) return true;
  return false;
});

function togglePreviewPower() {
  if (powerDisabled.value) return;
  if (previewAwake.value) emit("hibernate");
  else emit("resume");
}
</script>

<template>
  <section class="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden border-l border-line bg-surface">
    <div class="flex h-9 min-w-0 shrink-0 items-center gap-1.5 overflow-hidden px-2">
      <div class="cx-browser-tabstrip" role="tablist" :aria-label="t('preview.title')">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          role="tab"
          class="cx-browser-tab"
          :data-active="tab.id === activeTabId || undefined"
          :aria-selected="tab.id === activeTabId"
          tabindex="0"
          @click="selectTab(tab.id)"
          @keydown.enter.prevent="selectTab(tab.id)"
        >
          <Globe class="h-3.5 w-3.5 shrink-0 text-ink-500" />
          <span class="min-w-0 truncate font-medium">{{ tab.title }}</span>
          <span v-if="tab.id === tabs[0]?.id" class="shrink-0 text-ink-400">{{ port }}</span>
          <button
            v-if="tabs.length > 1"
            type="button"
            class="cx-browser-tab-close"
            :aria-label="t('preview.closeTab')"
            @click.stop="closeTab(tab.id)"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
        <UiIconButton :label="t('preview.openTab')" size="sm" :disabled="!src" @click="addTab">
          <Plus class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
      <div class="ml-2 hidden min-w-0 items-center gap-1.5 md:flex">
        <span v-if="viewport !== 'desktop'" class="cx-pill font-mono">
          {{ rotated ? sizes[viewport].h : sizes[viewport].w }}×{{ rotated ? sizes[viewport].w : sizes[viewport].h }}
        </span>
        <span v-if="debugSummary" class="cx-pill min-w-0" :title="t('preview.debugTitle')">
          <span class="truncate">{{ debugSummary }}</span>
        </span>
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-0.5">
        <a :href="browserUrl()" target="_blank" rel="noreferrer" class="inline-flex">
          <UiIconButton :label="t('preview.openExternal')" size="sm">
            <ExternalLink class="h-3.5 w-3.5" />
          </UiIconButton>
        </a>
        <UiIconButton :label="t('nav.toggleRail')" size="sm" @click="emit('toggle-rail')">
          <PanelRight class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiButton
          size="sm"
          variant="ghost"
          class="ml-0.5 max-sm:px-1.5"
          :disabled="powerDisabled"
          @click="togglePreviewPower"
        >
          <Moon v-if="previewAwake" class="h-3.5 w-3.5" />
          <Power v-else class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">{{ previewAwake ? t("preview.hibernate") : t("preview.wake") }}</span>
        </UiButton>
      </div>
    </div>

    <div class="relative z-30 flex h-8 min-w-0 shrink-0 items-center gap-1 border-y border-line px-2">
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
      <div class="min-w-0 flex-1 overflow-hidden">
        <input
          v-model="address"
          class="cx-address w-full min-w-0 truncate font-mono"
          spellcheck="false"
          :placeholder="t('preview.address')"
          :aria-label="t('preview.address')"
          @focus="addressFocused = true"
          @blur="addressFocused = false; syncAddress()"
          @keydown.enter.prevent="navigate"
        />
      </div>
      <div class="ml-1 flex shrink-0 items-center gap-0.5">
        <div class="hidden items-center gap-0.5 md:flex">
          <UiIconButton :label="t('preview.select')" size="sm" :active="toolMode === 'select'" @click="emit('update:toolMode', 'select')">
            <MousePointer2 class="h-3.5 w-3.5" />
          </UiIconButton>
          <UiIconButton
            :label="t('preview.inspect')"
            size="sm"
            :active="toolMode === 'inspect'"
            @click="emit('update:toolMode', toolMode === 'inspect' ? 'select' : 'inspect')"
          >
            <Scan class="h-3.5 w-3.5" />
          </UiIconButton>
          <span class="mx-0.5 h-3.5 w-px bg-white/10" />
        </div>
        <div class="hidden items-center gap-0.5 min-[900px]:flex">
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
        </div>
        <UiIconButton :label="t('preview.debugTitle')" size="sm" :active="debugOpen" @click="emit('update:debugOpen', !debugOpen)">
          <Activity class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
    </div>

    <div
      class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
      :class="viewport === 'desktop' ? '' : 'items-center justify-center p-4'"
    >
      <div
        v-if="showIframe"
        class="relative min-w-0 w-full overflow-hidden bg-white"
        :class="viewport === 'desktop' ? 'h-full w-full' : 'rounded-[10px] border border-line-strong'"
        :style="frame"
      >
        <iframe
          v-for="tab in tabs"
          v-show="tab.id === activeTabId"
          :key="`${tab.id}-${tab.frameKey}`"
          :ref="(el) => bindIframe(tab.id, el)"
          :src="tab.src"
          :title="t('preview.title')"
          class="preview h-full w-full min-w-0 bg-white"
          @load="onIframeLoad"
          @error="onIframeError"
        />
        <div v-if="tabUnavailable || !documentLoaded || iframeFailed" class="absolute inset-0 z-20 flex items-center justify-center bg-canvas">
          <StudioPreviewWait
            :title="waitTitle"
            :hint="waitHint"
            :elapsed="elapsed"
            :tone="waitTone"
          >
            <UiButton v-if="tabUnavailable && canEdit" class="mt-3" size="sm" @click="emit('resume')">
              {{ t("workspace.resume") }}
            </UiButton>
          </StudioPreviewWait>
        </div>
        <div
          v-if="toolMode !== 'select'"
          class="absolute inset-0 z-10 cursor-crosshair"
          role="presentation"
          :aria-label="t('preview.inspectHint')"
          @mousemove="onInspectMove"
          @mouseleave="clearInspect"
          @mousedown="onInspectDown"
        >
          <div
            v-if="dragBox && (dragBox.width > 4 || dragBox.height > 4)"
            class="pointer-events-none absolute rounded-none bg-coral-500/15 ring-1 ring-coral-500"
            :style="{ left: `${dragBox.left}px`, top: `${dragBox.top}px`, width: `${dragBox.width}px`, height: `${dragBox.height}px` }"
          />
          <div
            v-else-if="inspectBox"
            class="pointer-events-none absolute rounded-none bg-coral-500/12 ring-1 ring-coral-500"
            :style="{ left: `${inspectBox.left}px`, top: `${inspectBox.top}px`, width: `${inspectBox.width}px`, height: `${inspectBox.height}px` }"
          />
          <div
            v-if="inspectCaption && inspectBox && inspectTooltip && !dragBox"
            class="pointer-events-none absolute z-10 flex h-[22px] max-w-[min(100%,24rem)] items-center truncate rounded-[6px] border border-line-strong bg-raised px-1.5 text-[11px] font-medium leading-none text-ink-800 shadow-lift"
            :style="{ left: `${inspectTooltip.left}px`, top: `${inspectTooltip.top}px` }"
          >
            {{ inspectCaption }}
          </div>
        </div>
      </div>

      <div v-else-if="waiting" class="flex h-full w-full items-center justify-center">
        <StudioPreviewWait :title="waitTitle" :hint="waitHint" :elapsed="elapsed" />
      </div>

      <div v-else-if="showIdlePanel" class="flex h-full w-full items-center justify-center">
        <StudioPreviewWait
          :title="idleTitle"
          :hint="lastError || t('workspace.resumeHint')"
          tone="error"
        >
          <UiButton v-if="canEdit" class="mt-3" size="sm" @click="emit('resume')">{{ t("workspace.resume") }}</UiButton>
        </StudioPreviewWait>
      </div>
    </div>

  </section>
</template>
