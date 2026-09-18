<script setup lang="ts">
const { t } = useI18n();
const { leaving, signOut } = useSignOut();
</script>

<template>
  <main class="flex min-h-screen flex-col bg-canvas">
    <header class="login-topbar">
      <span class="app-brand">
        <UiLogo :size="22" />
        <span class="app-wordmark">{{ t("app.wordmark") }}</span>
      </span>
      <AuthLoginLocale />
    </header>
    <div class="flex flex-1 items-center justify-center px-4 pb-16">
      <div class="cx-panel w-full max-w-[400px] p-5">
        <UiLogo :size="22" />
        <h1 class="mt-4 text-[15px] font-semibold text-ink-950">{{ t("admin.disabledTitle") }}</h1>
        <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("admin.disabledBody") }}</p>
        <UiButton class="mt-4" variant="outline" :disabled="leaving" @click="signOut">
          {{ t("admin.signOut") }}
        </UiButton>
      </div>
    </div>
  </main>
</template>
