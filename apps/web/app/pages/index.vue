<script setup lang="ts">
import { Github, ArrowRight } from "lucide-vue-next";

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
  <main class="mesh relative min-h-screen overflow-hidden">
    <div class="grain pointer-events-none absolute inset-0 opacity-[0.05]" />
    <header class="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <div class="flex items-center gap-3">
        <UiLogo :size="36" />
        <span class="text-[15px] font-semibold tracking-tight">{{ t("app.name") }}</span>
      </div>
      <select
        class="h-9 rounded-full border border-line bg-paper/80 px-3 text-xs font-medium text-ink-600 shadow-inset outline-none"
        :value="locale"
        @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
      >
        <option value="en">{{ t("auth.english") }}</option>
        <option value="pt-BR">{{ t("auth.portuguese") }}</option>
      </select>
    </header>

    <section class="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-coral-600">{{ t("app.product") }}</p>
        <h1 class="mt-4 max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight text-ink-950 sm:text-6xl">
          {{ t("app.name") }}
        </h1>
        <p class="mt-5 max-w-lg text-lg leading-relaxed text-ink-500">{{ t("app.tagline") }}</p>
      </div>

      <div class="rounded-[28px] border border-line bg-paper/90 p-7 shadow-float backdrop-blur">
        <template v-if="!me">
          <h2 class="text-2xl font-semibold tracking-tight">{{ t("auth.title") }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-ink-500">{{ t("auth.subtitle") }}</p>
          <div class="mt-6 space-y-4">
            <label class="block">
              <span class="mb-1.5 block text-[13px] font-medium text-ink-600">{{ t("auth.loginLabel") }}</span>
              <UiInput v-model="login" :placeholder="t('auth.loginPlaceholder')" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-[13px] font-medium text-ink-600">{{ t("auth.localeLabel") }}</span>
              <select
                class="h-11 w-full rounded-2xl border border-line bg-white/80 px-3.5 text-sm shadow-inset outline-none focus:border-coral-400"
                :value="locale"
                @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
              >
                <option value="en">{{ t("auth.english") }}</option>
                <option value="pt-BR">{{ t("auth.portuguese") }}</option>
              </select>
            </label>
            <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
            <UiButton class="w-full" size="lg" :disabled="loading" @click="signIn">
              {{ t("auth.dev") }}
              <ArrowRight class="h-4 w-4" />
            </UiButton>
            <a href="/api/auth/github" class="block">
              <UiButton class="w-full" variant="outline" size="lg" type="button">
                <Github class="h-4 w-4" />
                {{ t("auth.github") }}
              </UiButton>
            </a>
          </div>
        </template>
        <template v-else>
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-300">{{ t("auth.welcomeBack") }}</p>
          <h2 class="mt-2 text-2xl font-semibold tracking-tight">{{ me.user.login }}</h2>
          <p class="mt-2 text-sm text-ink-500">{{ t("workspace.ready") }}</p>
          <UiButton class="mt-6 w-full" size="lg" :disabled="loading" @click="openWorkspace">
            {{ t("nav.openWorkspace") }}
            <ArrowRight class="h-4 w-4" />
          </UiButton>
        </template>
      </div>
    </section>
  </main>
</template>
