<script setup lang="ts">
const { t } = useI18n();
const leaving = ref(false);

async function signOut() {
  leaving.value = true;
  try {
    await $fetch("/api/auth/logout", { method: "POST" });
  } finally {
    await navigateTo("/");
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-canvas px-4">
    <div class="cx-panel w-full max-w-[400px] p-5">
      <UiLogo :size="22" />
      <h1 class="mt-4 text-[15px] font-semibold text-ink-950">{{ t("admin.disabledTitle") }}</h1>
      <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("admin.disabledBody") }}</p>
      <UiButton class="mt-4" variant="outline" :disabled="leaving" @click="signOut">
        {{ t("admin.signOut") }}
      </UiButton>
    </div>
  </main>
</template>
