<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const { data: setup, error: loadError } = await useAsyncData("github-setup", () =>
  $fetch<{
    configured: boolean;
    canCreate: boolean;
    org: string;
    repo: string;
    publicUrl: string;
    action: string | null;
    manifest: Record<string, unknown> | null;
    installUrl: string;
    storePath: string;
    listenOrigins?: string[];
    accessedPaths?: string[];
    callbackUrls?: string[];
    webhook?: { url: string; settingsUrl: string; hasSecret: boolean; secret: string | null };
  }>("/api/setup/github"),
);

const created = computed(() => route.query.created === "1");
const reused = computed(() => route.query.reused === "1");
const redeemCode = ref(route.query.error ? "" : String(route.query.code ?? ""));
const oauthCode = ref(String(route.query.error === "oauth" ? route.query.code ?? "" : ""));
const oauthInstallation = ref(String(route.query.installation_id ?? ""));
const redeeming = ref(false);
const redeemError = ref("");
const oauthError = ref("");
const oauthing = ref(false);
const errorKey = computed(() => {
  if (setup.value?.configured) return "";
  const code = String(route.query.error ?? "");
  if (code === "blocked") return "setup.github.blocked";
  if (code === "convert") return "setup.github.used";
  if (code === "state" || code === "code") return "setup.github.used";
  return "";
});

async function redeem() {
  redeeming.value = true;
  redeemError.value = "";
  try {
    await $fetch("/api/setup/github/convert", { method: "POST", body: { code: redeemCode.value.trim() } });
    await navigateTo("/setup/github?created=1");
    await refreshNuxtData("github-setup");
  } catch {
    redeemError.value = t("setup.github.error");
  } finally {
    redeeming.value = false;
  }
}

async function completeOAuth() {
  oauthing.value = true;
  oauthError.value = "";
  try {
    const res = await $fetch<{ next: string }>("/api/auth/github/complete", {
      method: "POST",
      body: { code: oauthCode.value.trim(), installationId: oauthInstallation.value.trim() || undefined },
    });
    await navigateTo(res.next);
  } catch {
    oauthError.value = t("setup.github.oauthError");
  } finally {
    oauthing.value = false;
  }
}

onMounted(async () => {
  if (setup.value?.canCreate && redeemCode.value) await redeem();
  if (route.query.setup_action === "install" && String(route.query.code ?? "") && !route.query.error) {
    oauthCode.value = String(route.query.code);
    oauthInstallation.value = String(route.query.installation_id ?? "");
    await completeOAuth();
  }
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

        <p v-if="created || (setup?.configured && reused)" class="mt-4 rounded-[10px] border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-100">
          {{ reused ? t("setup.github.already") : t("setup.github.saved") }}
        </p>
        <p v-else-if="setup?.configured && route.query.error" class="mt-4 rounded-[10px] border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-100">
          {{ t("setup.github.already") }}
        </p>
        <p v-if="errorKey" class="mt-4 text-sm text-red-400">{{ t(errorKey) }}</p>
        <p v-if="loadError" class="mt-4 text-sm text-red-400">{{ t("setup.github.error") }}</p>

        <template v-if="setup">
          <form v-if="setup.canCreate && setup.action && setup.manifest" class="mt-6" :action="setup.action" method="post">
            <input type="hidden" name="manifest" :value="JSON.stringify(setup.manifest)" />
            <UiButton type="submit" size="lg" class="w-full">{{ t("setup.github.create") }}</UiButton>
          </form>
          <p v-if="setup.canCreate" class="mt-3 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.hint") }}</p>

          <form v-if="setup.canCreate" class="mt-6 space-y-3" @submit.prevent="redeem">
            <p class="text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.pasteHint") }}</p>
            <label class="block">
              <span class="mb-1.5 block text-[13px] font-medium text-ink-600">{{ t("setup.github.pasteLabel") }}</span>
              <UiInput v-model="redeemCode" :placeholder="t('setup.github.pastePlaceholder')" />
            </label>
            <p v-if="redeemError" class="text-sm text-red-400">{{ redeemError }}</p>
            <UiButton type="submit" variant="outline" size="lg" class="w-full" :disabled="redeeming || !redeemCode.trim()">
              {{ t("setup.github.pasteSubmit") }}
            </UiButton>
          </form>

          <div v-if="setup.configured" class="mt-6 space-y-3">
            <p class="text-sm text-ink-800">{{ t("setup.github.configured") }}</p>
            <a :href="setup.installUrl" target="_blank" rel="noreferrer" class="block">
              <UiButton variant="outline" size="lg" class="w-full" type="button">{{ t("setup.github.install") }}</UiButton>
            </a>
            <p class="text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.installHint") }}</p>
            <div class="rounded-[10px] border border-line bg-white/5 p-3">
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("setup.github.accessedUrlsTitle") }}</p>
              <p class="mt-2 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.accessedUrlsHint") }}</p>
              <p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("setup.github.listenOriginsTitle") }}</p>
              <ul class="mt-2 space-y-1 font-mono text-[11px] text-ink-800">
                <li v-for="url in setup.listenOrigins" :key="url">{{ url }}</li>
              </ul>
              <p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("setup.github.accessedPathsTitle") }}</p>
              <ul class="mt-2 space-y-1 font-mono text-[11px] text-ink-800">
                <li v-for="path in setup.accessedPaths" :key="path">{{ path }}</li>
              </ul>
              <p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("setup.github.callbackUrlsTitle") }}</p>
              <p class="mt-2 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.callbackUrlsHint") }}</p>
              <ul class="mt-2 space-y-1 font-mono text-[11px] text-ink-800">
                <li v-for="url in setup.callbackUrls" :key="url">{{ url }}</li>
              </ul>
              <a
                v-if="setup.webhook"
                :href="setup.webhook.settingsUrl"
                target="_blank"
                rel="noreferrer"
                class="mt-3 inline-block text-[13px] font-medium text-coral-400"
              >
                {{ t("setup.github.callbackUrlsSettings") }}
              </a>
            </div>
            <form class="space-y-3" @submit.prevent="completeOAuth">
              <p class="text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.oauthPasteHint") }}</p>
              <UiInput v-model="oauthCode" :placeholder="t('setup.github.oauthPlaceholder')" />
              <p v-if="oauthError" class="text-sm text-red-400">{{ oauthError }}</p>
              <UiButton type="submit" variant="outline" size="lg" class="w-full" :disabled="oauthing || !oauthCode.trim()">
                {{ t("setup.github.oauthSubmit") }}
              </UiButton>
            </form>
            <p class="text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.envHint", { path: setup.storePath }) }}</p>
            <div v-if="setup.webhook" class="rounded-[10px] border border-line bg-white/5 p-3">
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("setup.github.webhookTitle") }}</p>
              <p class="mt-2 text-[12px] leading-relaxed text-ink-300">{{ t("setup.github.webhookHint") }}</p>
              <p class="mt-2 font-mono text-[11px] text-ink-800">{{ setup.webhook.url }}</p>
              <p v-if="setup.webhook.secret" class="mt-2 break-all font-mono text-[11px] text-ink-800">{{ setup.webhook.secret }}</p>
              <a :href="setup.webhook.settingsUrl" target="_blank" rel="noreferrer" class="mt-3 inline-block text-[13px] font-medium text-coral-400">
                {{ t("setup.github.webhookSettings") }}
              </a>
            </div>
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
