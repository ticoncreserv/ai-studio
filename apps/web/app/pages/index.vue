<script setup lang="ts">
import { ArrowRight, Eye, GitBranch, MonitorSmartphone, Share2, Sparkles, Workflow } from "@lucide/vue";

const { t, locale, setLocale } = useI18n();
const login = ref("studio");
const error = ref("");
const loading = ref(false);
const me = ref<null | {
  user: { login: string; platformAdmin?: boolean; disabled?: boolean };
  workspace: { id: string } | null;
  sessions?: Array<{ id: string; title: string }>;
}>(null);
const githubReady = ref(false);

onMounted(async () => {
  try {
    me.value = await $fetch("/api/me");
    if (me.value?.user.disabled) {
      await navigateTo("/disabled");
      return;
    }
  } catch (err) {
    const status = (err as { statusCode?: number; data?: { disabled?: boolean } }).statusCode;
    const disabled = (err as { data?: { disabled?: boolean } }).data?.disabled;
    if (status === 403 && disabled) {
      await navigateTo("/disabled");
      return;
    }
    me.value = null;
  }
  try {
    const setup = await $fetch<{ configured: boolean }>("/api/setup/github");
    githubReady.value = setup.configured;
  } catch {
    githubReady.value = false;
  }
});

async function signIn() {
  loading.value = true;
  error.value = "";
  try {
    await $fetch("/api/auth/dev", { method: "POST", body: { login: login.value, locale: locale.value } });
    me.value = await $fetch("/api/me");
    if (me.value?.user.disabled) {
      await navigateTo("/disabled");
    }
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

const features = computed(() => [
  { icon: GitBranch, text: t("app.featureBranch") },
  { icon: MonitorSmartphone, text: t("app.featurePreview") },
  { icon: Sparkles, text: t("app.featureRules") },
  { icon: Workflow, text: t("app.featureDb") },
  { icon: Share2, text: t("app.featureCollab") },
  { icon: Eye, text: t("app.featureSpectator") },
]);
</script>

<template>
  <main class="mesh relative min-h-screen overflow-hidden">
    <div class="grain pointer-events-none absolute inset-0 opacity-[0.09]" />
    <header class="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
      <div class="flex items-center gap-3">
        <UiLogo :size="30" />
        <div>
          <p class="text-[14px] font-semibold tracking-tight">{{ t("app.name") }}</p>
          <p class="hidden text-[11px] text-ink-300 sm:block">{{ t("app.product") }}</p>
        </div>
      </div>
      <select
        class="h-9 rounded-[9px] border border-line bg-white/5 px-3 text-xs font-medium text-ink-600 outline-none"
        :value="locale"
        @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
      >
        <option value="pt-BR">{{ t("auth.portuguese") }}</option>
        <option value="en">{{ t("auth.english") }}</option>
      </select>
    </header>

    <section class="relative mx-auto grid max-w-6xl items-start gap-10 px-6 pb-10 pt-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-14">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-coral-400">{{ t("app.product") }}</p>
        <h1 class="font-display mt-4 max-w-xl text-5xl leading-[1.02] text-ink-950 sm:text-6xl">
          {{ t("app.headline") }}
        </h1>
        <p class="mt-5 max-w-lg text-lg leading-relaxed text-ink-500">{{ t("app.lede") }}</p>
        <ul class="mt-8 grid gap-2 sm:grid-cols-2">
          <li
            v-for="feature in features"
            :key="feature.text"
            class="flex items-center gap-2.5 rounded-[12px] border border-line bg-white/5 px-3 py-2.5 text-[13px] text-ink-800"
          >
            <component :is="feature.icon" class="h-4 w-4 shrink-0 text-coral-400" />
            {{ feature.text }}
          </li>
        </ul>
      </div>

      <div class="glass-window p-7">
        <template v-if="!me">
          <h2 class="text-2xl font-semibold tracking-tight">{{ t("auth.title") }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-ink-500">{{ t("auth.subtitle") }}</p>
          <div class="mt-6 space-y-4">
            <label class="block">
              <span class="mb-1.5 block text-[13px] font-medium text-ink-600">{{ t("auth.loginLabel") }}</span>
              <UiInput v-model="login" :placeholder="t('auth.loginPlaceholder')" />
            </label>
            <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
            <UiButton class="w-full" size="lg" :disabled="loading" @click="signIn">
              <UiSpinner v-if="loading" size="sm" :label="t('nav.working')" />
              {{ loading ? t("nav.working") : t("auth.dev") }}
              <ArrowRight v-if="!loading" class="h-4 w-4" />
            </UiButton>
            <div class="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-ink-300">
              <span class="h-px flex-1 bg-white/10" />
              {{ t("auth.or") }}
              <span class="h-px flex-1 bg-white/10" />
            </div>
            <a href="/api/auth/github" class="block">
              <UiButton class="w-full" variant="outline" size="lg" type="button">
                <UiGithub class="h-4 w-4" />
                {{ t("auth.github") }}
              </UiButton>
            </a>
            <NuxtLink v-if="!githubReady" to="/setup/github" class="block text-center text-[13px] font-medium text-coral-400">
              {{ t("auth.createApp") }}
            </NuxtLink>
            <p class="text-[12px] leading-relaxed text-ink-300">{{ t("auth.localHint") }}</p>
          </div>
        </template>
        <template v-else>
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-300">{{ t("auth.welcomeBack") }}</p>
          <h2 class="mt-2 text-2xl font-semibold tracking-tight">{{ me.user.login }}</h2>
          <p class="mt-2 text-sm text-ink-500">{{ t("workspace.ready") }}</p>
          <UiButton class="mt-6 w-full" size="lg" :disabled="loading" @click="openWorkspace">
            <UiSpinner v-if="loading" size="sm" :label="t('nav.working')" />
            {{ loading ? t("workspace.loading") : t("nav.openWorkspace") }}
            <ArrowRight v-if="!loading" class="h-4 w-4" />
          </UiButton>
          <NuxtLink v-if="me.user.platformAdmin" to="/admin" class="mt-3 block text-center text-[13px] font-medium text-coral-400">
            {{ t("nav.admin") }}
          </NuxtLink>
          <ul v-if="me.sessions?.length" class="mt-5 space-y-1.5">
            <li v-for="session in me.sessions" :key="session.id" class="rounded-[10px] bg-white/5 px-3 py-2 text-[13px] text-ink-600">
              {{ session.title || t("chat.untitled") }}
            </li>
          </ul>
        </template>
      </div>
    </section>

    <section class="relative mx-auto max-w-6xl px-6 pb-20">
      <div class="glass-window overflow-hidden p-3 sm:p-4">
        <div class="mb-3 flex items-center gap-2 px-1">
          <span class="traffic" aria-hidden="true">
            <span class="tl-close" />
            <span class="tl-min" />
            <span class="tl-max" />
          </span>
          <span class="text-[11px] text-ink-300">{{ t("workspace.project") }}</span>
        </div>
        <div class="grid overflow-hidden rounded-[12px] border border-line bg-black/30 md:grid-cols-[0.9fr_1.2fr]">
          <div class="border-b border-line p-4 md:border-b-0 md:border-r">
            <div class="ml-8 rounded-[12px] bg-gradient-to-br from-coral-400 to-coral-600 px-3 py-2 text-[12px] text-[#061018]">
              {{ t("chat.suggestion1") }}
            </div>
            <p class="mt-4 text-[12px] leading-relaxed text-ink-500">{{ t("app.tagline") }}</p>
            <div class="mt-4 h-14 rounded-[12px] border border-line bg-white/5" />
          </div>
          <div class="preview-dots flex min-h-[220px] items-center justify-center p-6">
            <div class="w-full max-w-sm rounded-[12px] border border-line bg-black/35 p-4">
              <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-300">{{ t("preview.home") }}</p>
              <p class="mt-2 text-lg font-semibold tracking-tight">Quotes</p>
              <div class="mt-3 space-y-2">
                <div class="h-8 rounded-lg bg-white/5" />
                <div class="h-8 rounded-lg bg-white/5" />
                <div class="h-8 w-2/3 rounded-lg bg-white/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
