<script setup lang="ts">
const { t } = useI18n();
defineProps<{ error: { statusCode?: number; message?: string } }>();
</script>

<template>
  <main class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="w-full max-w-md rounded-2xl border border-line bg-paper p-8 shadow-lift">
      <UiLogo />
      <h1 class="mt-6 font-display text-4xl">{{ t("errors.generic") }}</h1>
      <p class="mt-2 text-ink-500">{{ error.message }}</p>
      <NuxtLink to="/" class="mt-6 inline-flex">
        <UiButton>{{ t("nav.home") }}</UiButton>
      </NuxtLink>
    </div>
  </main>
</template>
