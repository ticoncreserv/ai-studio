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
  <main class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="w-full max-w-md rounded-[28px] border border-line bg-paper p-8 shadow-float">
      <UiLogo />
      <h1 class="mt-6 text-3xl font-semibold tracking-tight">{{ t("invite.title") }}</h1>
      <p class="mt-2 text-sm leading-relaxed text-ink-500">{{ t("invite.created") }}</p>
      <UiButton class="mt-6" size="lg" @click="accept">{{ t("invite.accept") }}</UiButton>
      <p v-if="result?.pending" class="mt-4 text-sm text-amber-700">{{ t("invite.pending") }}</p>
      <p v-if="error" class="mt-4 text-sm text-red-500">{{ error }}</p>
      <a class="mt-6 inline-block text-sm font-medium text-coral-600" href="https://github.com/ticoncreserv/app/settings/access" target="_blank">
        {{ t("invite.githubAccess") }}
      </a>
    </div>
  </main>
</template>
