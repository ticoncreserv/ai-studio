<script setup lang="ts">
import { Globe, Maximize2 } from "@lucide/vue";

const { t } = useI18n();
const route = useRoute();
const data = ref<{ previewPath: string } | null>(null);
const expired = ref(false);
const documentLoaded = ref(false);
const waitClock = ref(0);
let waitTimer: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  waitTimer = setInterval(() => {
    waitClock.value += 1;
  }, 1000);
  try {
    data.value = await $fetch(`/api/share/${route.params.token}`);
  } catch {
    expired.value = true;
  }
});

onBeforeUnmount(() => clearInterval(waitTimer));

const elapsed = computed(() => `${Math.floor(waitClock.value / 60)}:${String(waitClock.value % 60).padStart(2, "0")}`);
const waitHint = computed(() => t("preview.waitIframeHint"));

function onFrameLoad() {
  documentLoaded.value = true;
}

function onPreviewMessage(event: MessageEvent) {
  const payload = event.data as { type?: string; source?: string };
  if (payload?.source === "atelier-preview" && payload.type === "atelier-preview-ready") {
    documentLoaded.value = true;
  }
}

onMounted(() => window.addEventListener("message", onPreviewMessage));
onBeforeUnmount(() => window.removeEventListener("message", onPreviewMessage));
</script>

<template>
  <main class="flex h-screen flex-col overflow-hidden bg-canvas">
    <header class="window-titlebar shrink-0">
      <span class="traffic hidden sm:flex" aria-hidden="true">
        <span class="tl-close" />
        <span class="tl-min" />
        <span class="tl-max" />
      </span>
      <span class="cx-browser-tab min-w-0">
        <Globe class="h-3.5 w-3.5 shrink-0 text-ink-500" />
        <span class="min-w-0 truncate font-medium">{{ t("share.title") }}</span>
      </span>
      <p class="hidden min-w-0 truncate text-[12px] text-ink-400 sm:block">{{ t("share.hint") }}</p>
      <div class="ml-auto flex shrink-0 items-center gap-1.5">
        <NuxtLink to="/" class="text-[12px] text-ink-500 hover:text-ink-950">{{ t("share.openStudio") }}</NuxtLink>
        <a v-if="data" :href="data.previewPath" target="_blank" rel="noreferrer" class="inline-flex">
          <UiIconButton :label="t('preview.openTab')" size="sm">
            <Maximize2 class="h-3.5 w-3.5" />
          </UiIconButton>
        </a>
      </div>
    </header>

    <div v-if="expired" class="flex flex-1 items-center justify-center">
      <StudioPreviewWait :title="t('share.expired')" tone="error" />
    </div>
    <div v-else-if="!data" class="flex flex-1 items-center justify-center">
      <StudioPreviewWait :title="t('share.loading')" :hint="t('preview.waitIframeHint')" :elapsed="elapsed" />
    </div>
    <div v-else class="relative min-h-0 flex-1">
      <iframe :src="data.previewPath" class="h-full w-full bg-white" :title="t('preview.title')" @load="onFrameLoad" />
      <div v-if="!documentLoaded" class="absolute inset-0 z-10 flex items-center justify-center bg-canvas">
        <StudioPreviewWait :title="t('preview.waitIframe')" :hint="waitHint" :elapsed="elapsed" />
      </div>
    </div>
  </main>
</template>
