<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const result = ref<{ pending?: boolean } | null>(null);
const error = ref("");

async function accept() {
  try {
    result.value = await $fetch(`/api/invite/${route.params.token}`, { method: "POST" });
    if (!result.value.pending) await navigateTo("/");
  } catch {
    error.value = t("errors.generic");
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-canvas px-4">
    <div class="cx-panel w-full max-w-[400px] p-5">
      <UiLogo :size="22" />
      <h1 class="mt-4 text-[15px] font-semibold text-ink-950">{{ t("invite.title") }}</h1>
      <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("invite.created") }}</p>
      <p class="mt-1 text-[11px] text-ink-400">{{ t("invite.expires") }}</p>
      <UiButton class="mt-4 w-full" @click="accept">{{ t("invite.accept") }}</UiButton>
      <p v-if="result?.pending" class="mt-3 text-[12px] text-amber-200/90">{{ t("invite.pending") }}</p>
      <p v-if="error" class="mt-3 text-[12px] text-red-400">{{ error }}</p>
      <a
        class="mt-3 block text-[12px] text-coral-400 hover:text-coral-300"
        href="https://github.com/ticoncreserv/app/settings/access"
        target="_blank"
        rel="noreferrer"
      >
        {{ t("invite.githubAccess") }}
      </a>
    </div>
  </main>
</template>
