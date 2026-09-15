<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const result = ref<{ pending?: boolean } | null>(null);
const error = ref("");

async function accept() {
  try {
    result.value = await $fetch(`/api/invite/${route.params.token}`, { method: "POST" });
  } catch {
    error.value = t("errors.generic");
  }
}
</script>

<template>
  <main class="mx-auto max-w-lg px-6 py-20">
    <h1 class="text-3xl text-white">{{ t("invite.title") }}</h1>
    <p class="mt-3 text-ink-500">{{ t("invite.created") }}</p>
    <UiButton class="mt-6" @click="accept">{{ t("invite.accept") }}</UiButton>
    <p v-if="result?.pending" class="mt-4 text-amber-300">{{ t("invite.pending") }}</p>
    <p v-if="error" class="mt-4 text-red-400">{{ error }}</p>
    <a class="mt-6 block text-sm text-copper-400" href="https://github.com/ticoncreserv/app/settings/access" target="_blank">
      {{ t("invite.githubAccess") }}
    </a>
  </main>
</template>
