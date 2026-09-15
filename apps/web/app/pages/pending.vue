<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <main class="mx-auto max-w-lg px-6 py-20">
    <h1 class="text-3xl text-white">{{ t("workspace.pendingAccess") }}</h1>
    <p class="mt-3 text-ink-500">{{ t("invite.pending") }}</p>
    <a class="mt-6 inline-block text-copper-400" href="https://github.com/ticoncreserv/app/settings/access" target="_blank">
      {{ t("invite.githubAccess") }}
    </a>
    <p class="mt-4 text-sm text-ink-500">{{ t("invite.revalidate") }}</p>
  </main>
</template>
