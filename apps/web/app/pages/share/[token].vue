<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";

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
const waitHint = computed(() => (waitClock.value >= 12 ? t("preview.waitSlowDb") : waitClock.value >= 4 ? t("preview.waitSlow") : t("preview.waitIframeHint")));

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
  <main class="os-desktop flex h-screen flex-col">
    <header class="menubar flex h-11 items-center gap-3 px-5">
      <span class="traffic" aria-hidden="true">
        <span class="tl-close" />
        <span class="tl-min" />
        <span class="tl-max" />
      </span>
      <UiLogo :size="22" />
      <div class="min-w-0 flex-1">
        <h1 class="text-sm font-semibold tracking-tight">{{ t("share.title") }}</h1>
        <p class="truncate text-[12px] text-ink-500">{{ t("share.hint") }}</p>
      </div>
      <NuxtLink to="/" class="text-[13px] font-medium text-ink-600">{{ t("share.openStudio") }}</NuxtLink>
      <a v-if="data" :href="data.previewPath" target="_blank">
        <UiIconButton :label="t('preview.openTab')">
          <ExternalLink class="h-4 w-4" />
        </UiIconButton>
      </a>
    </header>
    <div v-if="expired" class="flex flex-1 items-center justify-center p-8">
      <StudioPreviewWait :title="t('share.expired')" tone="error" />
    </div>
    <div v-else-if="!data" class="flex flex-1 items-center justify-center">
      <StudioPreviewWait :title="t('share.loading')" :hint="t('preview.waitIframeHint')" :elapsed="elapsed" />
    </div>
    <div v-else class="relative m-3 min-h-0 flex-1">
      <UiWindow :title="documentLoaded ? t('preview.title') : t('preview.waitIframe')" class="h-full">
        <iframe :src="data.previewPath" class="h-full w-full bg-white" :title="t('preview.title')" @load="onFrameLoad" />
      </UiWindow>
      <div v-if="!documentLoaded" class="absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-[#0b0d13]/92">
        <StudioPreviewWait :title="t('preview.waitIframe')" :hint="waitHint" :elapsed="elapsed" />
      </div>
    </div>
  </main>
</template>
