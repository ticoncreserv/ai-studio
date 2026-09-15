<script setup lang="ts">
const { t } = useI18n();
defineProps<{ error: { statusCode?: number; message?: string } }>();
</script>

<template>
  <main class="mx-auto max-w-lg px-6 py-20">
    <h1 class="text-3xl text-white">{{ t("errors.generic") }}</h1>
    <p class="mt-3 text-ink-500">{{ error.message }}</p>
    <NuxtLink to="/" class="mt-6 inline-block text-copper-400">{{ t("app.name") }}</NuxtLink>
  </main>
</template>
