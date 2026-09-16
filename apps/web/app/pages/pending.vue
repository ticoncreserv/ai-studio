<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-canvas px-4">
    <div class="cx-panel w-full max-w-[400px] p-5">
      <UiLogo :size="22" />
      <h1 class="mt-4 text-[15px] font-semibold text-ink-950">{{ t("workspace.pendingAccess") }}</h1>
      <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("invite.pending") }}</p>
      <a
        class="mt-4 block"
        href="https://github.com/ticoncreserv/app/settings/access"
        target="_blank"
        rel="noreferrer"
      >
        <UiButton class="w-full" type="button">{{ t("invite.githubAccess") }}</UiButton>
      </a>
      <a class="mt-3 block text-[12px] text-coral-400 hover:text-coral-300" href="/api/auth/github">
        {{ t("invite.revalidate") }}
      </a>
    </div>
  </main>
</template>
