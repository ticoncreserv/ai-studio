<script setup lang="ts">
const { t, locale, setLocale } = useI18n();
const login = ref("studio");
const error = ref("");
const loading = ref(false);
const me = ref<null | { user: { login: string }; workspace: { id: string } | null }>(null);

onMounted(async () => {
  try {
    me.value = await $fetch("/api/me");
  } catch {
    me.value = null;
  }
});

async function signIn() {
  loading.value = true;
  error.value = "";
  try {
    await $fetch("/api/auth/dev", { method: "POST", body: { login: login.value, locale: locale.value } });
    await navigateTo("/", { replace: true });
    me.value = await $fetch("/api/me");
  } catch {
    error.value = t("auth.error");
  } finally {
    loading.value = false;
  }
}

async function openWorkspace() {
  loading.value = true;
  try {
    const res = await $fetch<{ workspace: { id: string } }>("/api/workspace/open", { method: "POST" });
    await navigateTo(`/w/${res.workspace.id}`);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
    <p class="text-xs uppercase tracking-[0.2em] text-copper-400">{{ t("app.product") }}</p>
    <h1 class="mt-3 font-semibold text-5xl tracking-tight text-white">{{ t("app.name") }}</h1>
    <p class="mt-4 max-w-xl text-lg text-ink-500">{{ t("app.tagline") }}</p>

    <div v-if="!me" class="mt-10 max-w-md space-y-4 rounded-xl border border-ink-800 bg-ink-900 p-6">
      <h2 class="text-xl text-white">{{ t("auth.title") }}</h2>
      <p class="text-sm text-ink-500">{{ t("auth.subtitle") }}</p>
      <label class="block text-sm">
        <span class="mb-1 block text-ink-500">{{ t("auth.loginLabel") }}</span>
        <UiInput v-model="login" :placeholder="t('auth.loginPlaceholder')" />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-ink-500">{{ t("auth.localeLabel") }}</span>
        <select
          class="h-9 w-full rounded-md border border-ink-700 bg-ink-900 px-3 text-sm"
          :value="locale"
          @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
        >
          <option value="en">{{ t("auth.english") }}</option>
          <option value="pt-BR">{{ t("auth.portuguese") }}</option>
        </select>
      </label>
      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
      <div class="flex gap-2">
        <UiButton :disabled="loading" @click="signIn">{{ t("auth.dev") }}</UiButton>
        <a href="/api/auth/github">
          <UiButton variant="outline" type="button">{{ t("auth.github") }}</UiButton>
        </a>
      </div>
    </div>

    <div v-else class="mt-10 space-y-4">
      <p class="text-ink-500">{{ me.user.login }}</p>
      <UiButton :disabled="loading" @click="openWorkspace">{{ t("nav.openWorkspace") }}</UiButton>
    </div>
  </main>
</template>
