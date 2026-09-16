<script setup lang="ts">
import { ArrowRight, ChevronDown, Eye, GitBranch, MonitorSmartphone, Share2, Sparkles, Workflow } from "@lucide/vue";

const { t, locale, setLocale } = useI18n();
const route = useRoute();
const loading = ref(false);
const me = ref<null | {
  user: { login: string; platformAdmin?: boolean; disabled?: boolean };
  workspace: { id: string } | null;
  sessions?: Array<{ id: string; title: string }>;
}>(null);
const error = computed(() => (route.query.error ? t("auth.error") : ""));

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
});

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
  <main class="flex min-h-screen flex-col bg-canvas">
    <header class="window-titlebar shrink-0">
      <span class="traffic hidden sm:flex" aria-hidden="true">
        <span class="tl-close" />
        <span class="tl-min" />
        <span class="tl-max" />
      </span>
      <UiLogo :size="20" />
      <p class="text-[13px] font-medium text-ink-950">{{ t("app.name") }}</p>
      <span class="hidden text-[12px] text-ink-400 sm:inline">{{ t("app.product") }}</span>
      <!-- appearance-none keeps the native widget from painting its own light chrome. -->
      <span class="relative ml-auto inline-flex items-center">
        <select
          class="h-[26px] appearance-none rounded-[6px] border border-line bg-white/[0.03] pl-2 pr-6 text-[11px] text-ink-600 outline-none hover:text-ink-950"
          :value="locale"
          :aria-label="t('auth.localeLabel')"
          @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
        >
          <option value="pt-BR">{{ t("auth.portuguese") }}</option>
          <option value="en">{{ t("auth.english") }}</option>
        </select>
        <ChevronDown class="pointer-events-none absolute right-1.5 h-3 w-3 text-ink-400" />
      </span>
    </header>

    <div class="flex flex-1 items-center justify-center px-4 py-10">
      <div class="w-full max-w-[400px]">
        <div class="cx-panel p-5">
          <template v-if="!me">
            <h1 class="text-[15px] font-semibold text-ink-950">{{ t("auth.title") }}</h1>
            <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("auth.subtitle") }}</p>
            <p v-if="error" class="mt-3 text-[12px] text-red-400">{{ error }}</p>
            <a href="/api/auth/github" class="mt-4 block">
              <UiButton class="w-full" type="button">
                <UiGithub class="h-3.5 w-3.5" />
                {{ t("auth.github") }}
              </UiButton>
            </a>
          </template>
          <template v-else>
            <p class="text-[12px] text-ink-400">{{ t("auth.welcomeBack") }}</p>
            <h1 class="mt-0.5 text-[15px] font-semibold text-ink-950">{{ me.user.login }}</h1>
            <p class="mt-1 text-[12px] text-ink-500">{{ t("workspace.ready") }}</p>
            <UiButton class="mt-4 w-full" :disabled="loading" @click="openWorkspace">
              <UiSpinner v-if="loading" size="sm" :label="t('nav.working')" />
              {{ loading ? t("workspace.loading") : t("nav.openWorkspace") }}
              <ArrowRight v-if="!loading" class="h-3.5 w-3.5" />
            </UiButton>
            <div v-if="me.sessions?.length" class="mt-3">
              <p class="cx-nav-group">{{ t("nav.sessions") }}</p>
              <p v-for="session in me.sessions" :key="session.id" class="cx-session-row">
                <span class="cx-session-dot" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ session.title || t("chat.untitled") }}</span>
              </p>
            </div>
            <NuxtLink v-if="me.user.platformAdmin" to="/admin" class="mt-3 block text-[12px] text-coral-400 hover:text-coral-300">
              {{ t("nav.admin") }}
            </NuxtLink>
          </template>
        </div>

        <p class="mt-6 px-1 text-[12px] text-ink-500">{{ t("app.lede") }}</p>
        <ul class="mt-2">
          <li v-for="feature in features" :key="feature.text" class="flex items-center gap-2 px-1 py-1 text-[12.5px] text-ink-600">
            <component :is="feature.icon" class="h-3.5 w-3.5 shrink-0 text-ink-400" />
            {{ feature.text }}
          </li>
        </ul>
      </div>
    </div>

    <footer class="cx-footer shrink-0 justify-center border-t border-line">
      {{ t("app.tagline") }}
    </footer>
  </main>
</template>
