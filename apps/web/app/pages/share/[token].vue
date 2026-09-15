<script setup lang="ts">
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
  <main class="flex h-screen flex-col">
    <header class="border-b border-ink-800 px-4 py-3">
      <h1 class="text-sm text-white">{{ t("share.title") }}</h1>
      <p class="text-xs text-ink-500">{{ t("share.hint") }}</p>
    </header>
    <p v-if="expired" class="p-6 text-ink-500">{{ t("share.expired") }}</p>
    <iframe v-else-if="data" :src="data.previewPath" class="min-h-0 flex-1 bg-white" :title="t('preview.title')" />
  </main>
</template>
