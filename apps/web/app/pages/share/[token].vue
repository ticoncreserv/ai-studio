<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";

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
    <p v-if="expired" class="p-8 text-ink-500">{{ t("share.expired") }}</p>
    <div v-else-if="data" class="m-3 min-h-0 flex-1">
      <UiWindow :title="t('preview.title')" class="h-full">
        <iframe :src="data.previewPath" class="h-full w-full bg-white" :title="t('preview.title')" />
      </UiWindow>
    </div>
  </main>
</template>
