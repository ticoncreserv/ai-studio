<script setup lang="ts">
import { ArrowRight, Eye, GitBranch, Github, MonitorSmartphone, Share2, Sparkles, Workflow } from "lucide-vue-next";

const { t, locale, setLocale } = useI18n();
const login = ref("studio");
const error = ref("");
const loading = ref(false);
const me = ref<null | {
  user: { login: string };
  workspace: { id: string } | null;
  sessions?: Array<{ id: string; title: string }>;
}>(null);

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
    <div class="grain pointer-events-none absolute inset-0 opacity-[0.06]" />
    <header class="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <div class="flex items-center gap-3">
        <UiLogo :size="36" />
        <div>
          <p class="text-[15px] font-semibold tracking-tight">{{ t("app.name") }}</p>
          <p class="hidden text-[11px] text-ink-400 sm:block">{{ t("app.product") }}</p>
        </div>
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

    <section class="relative mx-auto grid max-w-6xl items-start gap-10 px-6 pb-10 pt-4 lg:grid-cols-[1.15fr_0.85fr] lg:pt-10">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-coral-600">{{ t("app.product") }}</p>
        <h1 class="font-display mt-4 max-w-xl text-5xl leading-[1.05] text-ink-950 sm:text-6xl">
          {{ t("app.headline") }}
        </h1>
        <p class="mt-5 max-w-lg text-lg leading-relaxed text-ink-500">{{ t("app.lede") }}</p>
        <ul class="mt-8 grid gap-2 sm:grid-cols-2">
          <li
            v-for="feature in features"
            :key="feature.text"
            class="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-paper/60 px-3 py-2.5 text-[13px] text-ink-700"
          >
            <component :is="feature.icon" class="h-4 w-4 shrink-0 text-coral-500" />
            {{ feature.text }}
          </li>
        </ul>
      </div>

      <div class="rounded-2xl border border-line bg-paper/90 p-7 shadow-float backdrop-blur">
        <template v-if="!me">
          <h2 class="text-2xl font-semibold tracking-tight">{{ t("auth.title") }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-ink-500">{{ t("auth.subtitle") }}</p>
          <div class="mt-6 space-y-4">
            <label class="block">
              <span class="mb-1.5 block text-[13px] font-medium text-ink-600">{{ t("auth.loginLabel") }}</span>
              <UiInput v-model="login" :placeholder="t('auth.loginPlaceholder')" />
            </label>
            <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
            <UiButton class="w-full" size="lg" :disabled="loading" @click="signIn">
              {{ t("auth.dev") }}
              <ArrowRight class="h-4 w-4" />
            </UiButton>
            <div class="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-ink-300">
              <span class="h-px flex-1 bg-line" />
              {{ t("auth.or") }}
              <span class="h-px flex-1 bg-line" />
            </div>
            <a href="/api/auth/github" class="block">
              <UiButton class="w-full" variant="outline" size="lg" type="button">
                <Github class="h-4 w-4" />
                {{ t("auth.github") }}
              </UiButton>
            </a>
            <p class="text-[12px] leading-relaxed text-ink-300">{{ t("auth.localHint") }}</p>
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
          <ul v-if="me.sessions?.length" class="mt-5 space-y-1.5">
            <li v-for="session in me.sessions" :key="session.id" class="rounded-xl bg-canvas/80 px-3 py-2 text-[13px] text-ink-600">
              {{ session.title || t("chat.untitled") }}
            </li>
          </ul>
        </template>
      </div>
    </section>

    <section class="relative mx-auto max-w-6xl px-6 pb-20">
      <div class="overflow-hidden rounded-2xl border border-line bg-[#2a221c] p-3 shadow-float sm:p-4">
        <div class="mb-3 flex items-center gap-2 px-2">
          <span class="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span class="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span class="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span class="ml-2 text-[11px] text-white/40">{{ t("workspace.project") }}</span>
        </div>
        <div class="grid overflow-hidden rounded-xl bg-[#f6efe6] md:grid-cols-[0.9fr_1.2fr]">
          <div class="border-b border-line p-4 md:border-b-0 md:border-r">
            <div class="ml-8 rounded-2xl rounded-br-md bg-ink-950 px-3 py-2 text-[12px] text-white">
              {{ t("chat.suggestion1") }}
            </div>
            <p class="mt-4 text-[12px] leading-relaxed text-ink-600">{{ t("app.tagline") }}</p>
            <div class="mt-4 h-16 rounded-2xl border border-line bg-white" />
          </div>
          <div class="preview-dots flex min-h-[220px] items-center justify-center p-6">
            <div class="w-full max-w-sm rounded-xl bg-white p-4 shadow-lift">
              <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-300">{{ t("preview.home") }}</p>
              <p class="mt-2 text-lg font-semibold tracking-tight">Quotes</p>
              <div class="mt-3 space-y-2">
                <div class="h-8 rounded-lg bg-ink-100" />
                <div class="h-8 rounded-lg bg-ink-100" />
                <div class="h-8 w-2/3 rounded-lg bg-ink-100" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
