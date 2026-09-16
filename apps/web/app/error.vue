<script setup lang="ts">
const { t } = useI18n();
defineProps<{ error: { statusCode?: number; message?: string } }>();
</script>

<template>
  <main class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="glass-window w-full max-w-md p-8">
      <UiLogo />
      <h1 class="font-display mt-6 text-4xl">{{ t("errors.generic") }}</h1>
      <p class="mt-2 text-ink-500">{{ error.message }}</p>
      <NuxtLink to="/" class="mt-6 inline-flex">
        <UiButton>{{ t("nav.home") }}</UiButton>
      </NuxtLink>
    </div>
  </main>
</template>
