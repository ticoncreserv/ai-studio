<script setup lang="ts">
import { ArrowRight } from "@lucide/vue";

const { t } = useI18n();
const route = useRoute();
const loading = ref(false);
const ready = ref(false);
const me = ref<null | {
  user: { login: string; platformAdmin?: boolean; disabled?: boolean };
  workspace: { id: string } | null;
  sessions?: Array<{ id: string; title: string }>;
}>(null);
const error = computed(() => (route.query.error === "github" ? t("auth.error") : ""));

useHead({
  title: () => `${t("app.name")} · ${t("auth.title")}`,
});

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
  } finally {
    ready.value = true;
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
</script>

<template>
  <main class="login-screen">
    <AuthLoginAtmosphere />

    <header class="login-topbar">
      <span class="login-brand">
        <UiLogo :size="18" />
        <span>{{ t("app.name") }}</span>
      </span>
      <AuthLoginLocale />
    </header>

    <div class="login-stage">
      <div class="login-stack">
        <div class="login-rise login-rise-1">
          <AuthLoginMark :size="76" />
        </div>

        <template v-if="!ready">
          <UiSpinner class="login-rise login-rise-2" :label="t('nav.working')" />
        </template>

        <template v-else-if="!me">
          <p class="login-kicker login-rise login-rise-2">{{ t("workspace.project") }}</p>
          <h1 class="login-title login-rise login-rise-3">{{ t("auth.title") }}</h1>
          <p class="login-copy login-rise login-rise-4">{{ t("auth.subtitle") }}</p>
          <p v-if="error" class="login-error login-rise login-rise-4" role="alert">{{ error }}</p>
          <a href="/api/auth/github" class="login-cta login-rise login-rise-5">
            <UiGithub :size="16" />
            {{ t("auth.github") }}
          </a>
        </template>

        <template v-else>
          <p class="login-kicker login-rise login-rise-2">{{ t("auth.welcomeBack") }}</p>
          <h1 class="login-title login-rise login-rise-3">{{ me.user.login }}</h1>
          <p class="login-copy login-rise login-rise-4">{{ t("auth.sessionReady") }}</p>
          <button class="login-cta login-rise login-rise-5" type="button" :disabled="loading" @click="openWorkspace">
            <UiSpinner v-if="loading" size="sm" :label="t('nav.working')" />
            {{ loading ? t("workspace.loading") : t("nav.openWorkspace") }}
            <ArrowRight v-if="!loading" class="h-4 w-4" />
          </button>
          <div v-if="me.sessions?.length" class="login-sessions login-rise login-rise-5">
            <p class="login-sessions-label">{{ t("nav.sessions") }}</p>
            <p v-for="session in me.sessions" :key="session.id" class="login-session">
              <span class="cx-session-dot" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ session.title || t("chat.untitled") }}</span>
            </p>
          </div>
          <NuxtLink v-if="me.user.platformAdmin" to="/admin" class="login-admin login-rise login-rise-5">
            {{ t("nav.admin") }}
          </NuxtLink>
        </template>
      </div>
    </div>
  </main>
</template>
