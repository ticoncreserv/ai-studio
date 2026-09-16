<script setup lang="ts">
const { t } = useI18n();
defineProps<{ error: { statusCode?: number; message?: string } }>();
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-canvas px-4">
    <div class="cx-panel w-full max-w-[400px] p-5">
      <UiLogo :size="22" />
      <h1 class="mt-4 text-[15px] font-semibold text-ink-950">
        {{ t("errors.generic") }}
        <span v-if="error.statusCode" class="font-mono text-[12px] font-normal text-ink-400">{{ error.statusCode }}</span>
      </h1>
      <p class="mt-1 break-words text-[12px] leading-relaxed text-ink-500">{{ error.message }}</p>
      <NuxtLink to="/" class="mt-4 inline-flex">
        <UiButton variant="outline">{{ t("nav.home") }}</UiButton>
      </NuxtLink>
    </div>
  </main>
</template>
