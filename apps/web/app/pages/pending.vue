<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <main class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="glass-window w-full max-w-md p-8">
      <UiLogo />
      <h1 class="font-display mt-6 text-4xl leading-tight">{{ t("workspace.pendingAccess") }}</h1>
      <p class="mt-3 text-sm leading-relaxed text-ink-500">{{ t("invite.pending") }}</p>
      <a
        class="mt-6 inline-flex h-11 items-center justify-center rounded-[11px] bg-coral-500 px-5 text-sm font-medium text-[#061018] shadow-glow"
        href="https://github.com/ticoncreserv/app/settings/access"
        target="_blank"
      >
        {{ t("invite.githubAccess") }}
      </a>
      <a class="mt-4 block text-sm font-medium text-ink-600" href="/api/auth/github">
        {{ t("invite.revalidate") }}
      </a>
    </div>
  </main>
</template>
