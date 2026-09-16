<script setup lang="ts">
import { ExternalLink } from "lucide-vue-next";

const { t } = useI18n();
const route = useRoute();
const data = ref<{ previewPath: string } | null>(null);
const expired = ref(false);

onMounted(async () => {
  try {
    data.value = await $fetch(`/api/share/${route.params.token}`);
  } catch {
    expired.value = true;
  }
});
</script>

<template>
  <main class="flex h-screen flex-col bg-canvas">
    <header class="flex h-14 items-center gap-3 border-b border-line bg-paper/80 px-5 backdrop-blur-xl">
      <UiLogo :size="28" />
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
    <p v-if="expired" class="p-8 text-ink-500">{{ t("share.expired") }}</p>
    <div v-else-if="data" class="preview-dots m-4 min-h-0 flex-1 overflow-hidden rounded-2xl border border-line p-2">
      <iframe :src="data.previewPath" class="h-full w-full rounded-xl bg-white shadow-float" :title="t('preview.title')" />
    </div>
  </main>
</template>
