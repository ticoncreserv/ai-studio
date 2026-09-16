<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <main class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="w-full max-w-md rounded-[28px] border border-line bg-paper p-8 shadow-float">
      <UiLogo />
      <h1 class="mt-6 text-3xl font-semibold tracking-tight">{{ t("workspace.pendingAccess") }}</h1>
      <p class="mt-2 text-sm leading-relaxed text-ink-500">{{ t("invite.pending") }}</p>
      <a class="mt-6 inline-block text-sm font-medium text-coral-600" href="https://github.com/ticoncreserv/app/settings/access" target="_blank">
        {{ t("invite.githubAccess") }}
      </a>
      <p class="mt-4 text-sm text-ink-500">{{ t("invite.revalidate") }}</p>
    </div>
  </main>
</template>
