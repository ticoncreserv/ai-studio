<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const setup = ref<{
  configured: boolean;
  canCreate: boolean;
  org: string;
  repo: string;
  publicUrl: string;
  action: string | null;
  manifest: Record<string, unknown> | null;
  installUrl: string;
  storePath: string;
} | null>(null);
const loadError = ref("");

onMounted(async () => {
  try {
    setup.value = await $fetch("/api/setup/github");
  } catch {
    loadError.value = t("setup.github.error");
  }
});

const created = computed(() => route.query.created === "1");
const errorKey = computed(() => {
  const code = String(route.query.error ?? "");
  if (code === "blocked") return "setup.github.blocked";
  if (code === "state" || code === "code" || code === "convert") return "setup.github.error";
  return "";
});
</script>

<template>
  <main class="mesh min-h-screen px-6 py-10">
    <div class="mx-auto w-full max-w-xl">
      <NuxtLink to="/" class="inline-flex items-center gap-2 text-[13px] text-ink-400 hover:text-ink-950">
        {{ t("setup.github.back") }}
      </NuxtLink>
      <div class="glass-window mt-5 p-8">
        <UiLogo />
        <h1 class="font-display mt-6 text-4xl leading-tight text-ink-950">{{ t("setup.github.title") }}</h1>
        <p class="mt-3 text-sm leading-relaxed text-ink-500">{{ t("setup.github.lede") }}</p>

        <p v-if="created" class="mt-4 rounded-[10px] border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-100">
          {{ t("setup.github.saved") }}
        </p>
        <p v-if="errorKey" class="mt-4 text-sm text-red-400">{{ t(errorKey) }}</p>
        <p v-if="loadError" class="mt-4 text-sm text-red-400">{{ loadError }}</p>

        <template v-if="setup">
          <form v-if="setup.canCreate && setup.action && setup.manifest" class="mt-6" :action="setup.action" method="post">
            <input type="hidden" name="manifest" :value="JSON.stringify(setup.manifest)" />
            <UiButton type="submit" size="lg" class="w-full">{{ t("setup.github.create") }}</UiButton>
          </form>
          <p v-if="setup.canCreate" class="mt-3 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.hint") }}</p>

          <div v-if="setup.configured" class="mt-6 space-y-3">
            <p class="text-sm text-ink-800">{{ t("setup.github.configured") }}</p>
            <a :href="setup.installUrl" target="_blank" rel="noreferrer" class="block">
              <UiButton variant="outline" size="lg" class="w-full" type="button">{{ t("setup.github.install") }}</UiButton>
            </a>
            <p class="text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.installHint") }}</p>
            <p class="text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.envHint", { path: setup.storePath }) }}</p>
            <a href="/api/auth/github" class="block">
              <UiButton class="w-full" size="lg" type="button">{{ t("auth.github") }}</UiButton>
            </a>
          </div>

          <div class="mt-8 border-t border-line pt-6">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("setup.github.manualTitle") }}</p>
            <dl class="mt-3 space-y-2 text-[13px]">
              <div>
                <dt class="text-ink-400">{{ t("setup.github.homepage") }}</dt>
                <dd class="font-mono text-ink-800">{{ setup.publicUrl }}</dd>
              </div>
              <div>
                <dt class="text-ink-400">{{ t("setup.github.callback") }}</dt>
                <dd class="font-mono text-[12px] text-ink-800">{{ setup.publicUrl }}/api/auth/github/callback</dd>
              </div>
            </dl>
            <p class="mt-3 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.permissions") }}</p>
            <p class="mt-2 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.oauthHint") }}</p>
          </div>

          <div class="mt-6 border-t border-line pt-6">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("setup.github.cursorTitle") }}</p>
            <p class="mt-2 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.cursorHint") }}</p>
          </div>
        </template>
      </div>
    </div>
  </main>
</template>
