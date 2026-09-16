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
  <main class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="glass-window w-full max-w-md p-8">
      <UiLogo />
      <h1 class="font-display mt-6 text-4xl leading-tight">{{ t("admin.disabledTitle") }}</h1>
      <p class="mt-3 text-sm leading-relaxed text-ink-500">{{ t("admin.disabledBody") }}</p>
      <UiButton class="mt-6" :disabled="leaving" @click="signOut">
        {{ t("admin.signOut") }}
      </UiButton>
    </div>
  </main>
</template>
