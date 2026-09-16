<script setup lang="ts">
const { t } = useI18n();

type Section = "overview" | "env" | "providers" | "users" | "rules" | "flags" | "workspaces";

const section = ref<Section>("overview");
const loading = ref(true);
const forbidden = ref(false);
const toast = ref("");
const error = ref("");
const busy = ref(false);

const overview = ref<{
  githubConfigured: boolean;
  cursorKey: boolean;
  publicUrl: string;
  users: number;
  running: number;
  hibernated: number;
  error: number;
  lastPreviewError: string | null;
  flags: Record<string, boolean>;
} | null>(null);
const env = ref<{ env: Record<string, string>; raw: string }>({ env: {}, raw: "" });
const providers = ref<
  Array<{ id: string; label: string; enabled: boolean; implemented: boolean; hasKey: boolean }>
>([]);
const providerKeys = ref<Record<string, string>>({});
const users = ref<
  Array<{
    id: string;
    login: string;
    name: string;
    role: string;
    accessPending: boolean;
    platformAdmin: boolean;
    envAdmin: boolean;
    workspaceStatus: string | null;
    lastActiveAt: string | null;
  }>
>([]);
const rules = ref<Array<{ id: string; level: "platform" | "project" | "user"; title: string; body: string }>>([]);
const workspaces = ref<
  Array<{
    id: string;
    login: string;
    branch: string;
    status: string;
    lastError: string | null;
    lastActiveAt: string;
  }>
>([]);

const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "admin.overview" },
  { id: "env", label: "admin.env" },
  { id: "providers", label: "admin.providers" },
  { id: "users", label: "admin.users" },
  { id: "rules", label: "admin.rules" },
  { id: "flags", label: "admin.flags" },
  { id: "workspaces", label: "admin.workspaces" },
];

async function load() {
  loading.value = true;
  forbidden.value = false;
  try {
    const me = await $fetch<{ user: { platformAdmin?: boolean } }>("/api/me");
    if (!me.user.platformAdmin) {
      forbidden.value = true;
      return;
    }
    const [over, envRes, providerRes, userRes, ruleRes, workspaceRes] = await Promise.all([
      $fetch<NonNullable<typeof overview.value>>("/api/admin/overview"),
      $fetch<{ env: Record<string, string>; raw: string }>("/api/admin/env"),
      $fetch<{ providers: typeof providers.value }>("/api/admin/providers"),
      $fetch<{ users: typeof users.value }>("/api/admin/users"),
      $fetch<{ rules: typeof rules.value }>("/api/admin/rules"),
      $fetch<{ workspaces: typeof workspaces.value }>("/api/admin/workspaces"),
    ]);
    overview.value = over;
    env.value = envRes;
    providers.value = providerRes.providers;
    users.value = userRes.users;
    rules.value = ruleRes.rules;
    workspaces.value = workspaceRes.workspaces;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    forbidden.value = status === 401 || status === 403;
    if (!forbidden.value) error.value = t("admin.error");
  } finally {
    loading.value = false;
  }
}

function flash(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 2400);
}

async function wrap(run: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  try {
    await run();
    flash(t("admin.saved"));
  } catch {
    error.value = t("admin.error");
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(section, () => {
  error.value = "";
});

async function saveEnv(payload: { env?: Record<string, string>; raw?: string }) {
  await wrap(async () => {
    env.value = await $fetch("/api/admin/env", { method: "PUT", body: payload });
  });
}

async function applyEnv() {
  await wrap(async () => {
    await $fetch("/api/admin/env/apply", { method: "POST" });
    flash(t("admin.applied"));
  });
}

async function saveProvider(id: string, enabled: boolean) {
  await wrap(async () => {
    const res = await $fetch<{ providers: typeof providers.value }>("/api/admin/providers", {
      method: "PUT",
      body: { id, enabled, apiKey: providerKeys.value[id] || undefined },
    });
    providers.value = res.providers;
    providerKeys.value[id] = "";
  });
}

async function toggleAdmin(userId: string, next: boolean) {
  await wrap(async () => {
    await $fetch(`/api/admin/users/${userId}`, { method: "PATCH", body: { platformAdmin: next } });
    await load();
  });
}

async function saveRules() {
  await wrap(async () => {
    const res = await $fetch<{ rules: typeof rules.value }>("/api/admin/rules", { method: "PUT", body: { rules: rules.value } });
    rules.value = res.rules.filter((row) => row.level !== "user");
  });
}

async function patchFlag(flag: string, value: boolean) {
  await wrap(async () => {
    if (!overview.value) return;
    overview.value.flags = await $fetch("/api/flags", { method: "PATCH", body: { [flag]: value } });
  });
}

async function hibernateWorkspace(id: string) {
  await wrap(async () => {
    await $fetch(`/api/admin/workspaces/${id}/hibernate`, { method: "POST" });
    await load();
  });
}
</script>

<template>
  <main class="mesh relative min-h-screen overflow-hidden">
    <div class="grain pointer-events-none absolute inset-0 opacity-[0.09]" />
    <div class="relative mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <UiLogo :size="28" />
          <div>
            <p class="text-[14px] font-semibold tracking-tight">{{ t("admin.title") }}</p>
            <p class="hidden text-[12px] text-ink-400 sm:block">{{ t("admin.lede") }}</p>
          </div>
        </div>
        <NuxtLink to="/" class="text-[13px] font-medium text-coral-400">{{ t("admin.back") }}</NuxtLink>
      </header>

      <p v-if="toast" class="mt-4 rounded-[10px] border border-line bg-white/5 px-3 py-2 text-sm text-ink-700">
        {{ toast }}
      </p>
      <p v-if="error" class="mt-4 text-sm text-red-400">{{ error }}</p>

      <div v-if="loading" class="mt-16 flex justify-center">
        <UiSpinner size="lg" :label="t('nav.working')" />
      </div>

      <div v-else-if="forbidden" class="glass-window mx-auto mt-16 max-w-md p-8">
        <h1 class="text-2xl font-semibold">{{ t("admin.forbidden") }}</h1>
        <NuxtLink to="/" class="mt-4 inline-block text-sm font-medium text-coral-400">{{ t("admin.back") }}</NuxtLink>
      </div>

      <div v-else class="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav class="glass-window flex flex-row gap-1 overflow-x-auto p-2 lg:flex-col">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            class="rounded-[9px] px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap"
            :class="section === item.id ? 'bg-white/10 text-ink-950' : 'text-ink-500 hover:bg-white/5'"
            @click="section = item.id"
          >
            {{ t(item.label) }}
          </button>
        </nav>

        <section class="glass-window min-w-0 p-5 sm:p-6">
          <template v-if="section === 'overview' && overview">
            <h2 class="text-xl font-semibold">{{ t("admin.overview") }}</h2>
            <dl class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-2xl border border-line bg-canvas/50 p-3">
                <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-300">{{ t("admin.github") }}</dt>
                <dd class="mt-1 text-sm font-medium">
                  {{ overview.githubConfigured ? t("admin.configured") : t("admin.missing") }}
                </dd>
              </div>
              <div class="rounded-2xl border border-line bg-canvas/50 p-3">
                <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-300">{{ t("admin.cursorKey") }}</dt>
                <dd class="mt-1 text-sm font-medium">
                  {{ overview.cursorKey ? t("admin.configured") : t("admin.missing") }}
                </dd>
              </div>
              <div class="rounded-2xl border border-line bg-canvas/50 p-3 sm:col-span-2">
                <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-300">{{ t("admin.publicUrl") }}</dt>
                <dd class="mt-1 font-mono text-[13px]">{{ overview.publicUrl }}</dd>
              </div>
              <div class="rounded-2xl border border-line bg-canvas/50 p-3">
                <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-300">{{ t("admin.userCount") }}</dt>
                <dd class="mt-1 text-2xl font-semibold">{{ overview.users }}</dd>
              </div>
              <div class="rounded-2xl border border-line bg-canvas/50 p-3">
                <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-300">{{ t("admin.running") }}</dt>
                <dd class="mt-1 text-2xl font-semibold">{{ overview.running }}</dd>
              </div>
              <div class="rounded-2xl border border-line bg-canvas/50 p-3">
                <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-300">{{ t("admin.hibernated") }}</dt>
                <dd class="mt-1 text-2xl font-semibold">{{ overview.hibernated }}</dd>
              </div>
              <div class="rounded-2xl border border-line bg-canvas/50 p-3">
                <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-300">{{ t("admin.errored") }}</dt>
                <dd class="mt-1 text-2xl font-semibold">{{ overview.error }}</dd>
              </div>
            </dl>
            <p class="mt-4 text-sm text-ink-500">
              {{ overview.lastPreviewError ? `${t("admin.lastError")}: ${overview.lastPreviewError}` : t("admin.noError") }}
            </p>
          </template>

          <template v-else-if="section === 'env'">
            <h2 class="text-xl font-semibold">{{ t("admin.env") }}</h2>
            <p class="mt-2 text-sm text-ink-500">{{ t("admin.envHint") }}</p>
            <AdminEnvEditor class="mt-4" :env="env.env" :raw="env.raw" reveal-url="/api/admin/env" @save="saveEnv" />
            <UiButton class="mt-3" variant="outline" :disabled="busy" @click="applyEnv">
              {{ t("admin.applyEnv") }}
            </UiButton>
          </template>

          <template v-else-if="section === 'providers'">
            <h2 class="text-xl font-semibold">{{ t("admin.providers") }}</h2>
            <p class="mt-2 text-sm text-ink-500">{{ t("admin.providersHint") }}</p>
            <article v-for="provider in providers" :key="provider.id" class="mt-4 rounded-2xl border border-line bg-canvas/50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="font-semibold">{{ provider.label }}</h3>
                <UiBadge :tone="provider.implemented ? 'live' : 'neutral'">
                  {{ provider.implemented ? t("admin.enabled") : t("admin.comingSoon") }}
                </UiBadge>
              </div>
              <label class="mt-3 flex items-center justify-between">
                <span class="text-sm">{{ t("admin.enabled") }}</span>
                <UiSwitch
                  :model-value="provider.enabled"
                  :label="t('admin.enabled')"
                  @update:model-value="provider.enabled = $event"
                />
              </label>
              <p class="mt-2 text-[12px] text-ink-400">
                {{ provider.hasKey ? t("admin.hasKey") : t("admin.noKey") }}
              </p>
              <label class="mt-3 block">
                <span class="mb-1 block text-[12px] text-ink-400">{{ t("admin.apiKey") }}</span>
                <UiInput v-model="providerKeys[provider.id]" type="password" :placeholder="t('admin.apiKeyPlaceholder')" />
              </label>
              <UiButton class="mt-3" size="sm" :disabled="busy" @click="saveProvider(provider.id, provider.enabled)">
                {{ t("admin.saveProvider") }}
              </UiButton>
            </article>
          </template>

          <template v-else-if="section === 'users'">
            <h2 class="text-xl font-semibold">{{ t("admin.users") }}</h2>
            <p class="mt-2 text-sm text-ink-500">{{ t("admin.usersHint") }}</p>
            <p v-if="!users.length" class="mt-4 text-sm text-ink-400">{{ t("admin.noUsers") }}</p>
            <div class="mt-4 overflow-x-auto">
              <table class="w-full min-w-[640px] text-left text-[13px]">
                <thead class="text-[11px] uppercase tracking-[0.12em] text-ink-300">
                  <tr>
                    <th class="pb-2 font-medium">{{ t("admin.login") }}</th>
                    <th class="pb-2 font-medium">{{ t("admin.role") }}</th>
                    <th class="pb-2 font-medium">{{ t("admin.status") }}</th>
                    <th class="pb-2 font-medium">{{ t("admin.lastActive") }}</th>
                    <th class="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="user in users" :key="user.id" class="border-t border-line">
                    <td class="py-3">
                      <p class="font-medium">{{ user.login }}</p>
                      <p class="text-[11px] text-ink-400">{{ user.name }}</p>
                    </td>
                    <td class="py-3">{{ user.role }}</td>
                    <td class="py-3">
                      <span v-if="user.accessPending">{{ t("admin.pending") }}</span>
                      <span v-else>{{ user.workspaceStatus ?? "—" }}</span>
                    </td>
                    <td class="py-3 font-mono text-[11px]">{{ user.lastActiveAt?.slice(0, 16) ?? "—" }}</td>
                    <td class="py-3 text-right">
                      <p v-if="user.envAdmin" class="text-[11px] text-ink-400">{{ t("admin.envLocked") }}</p>
                      <UiButton
                        v-else
                        size="sm"
                        variant="outline"
                        :disabled="busy"
                        @click="toggleAdmin(user.id, !user.platformAdmin)"
                      >
                        {{ user.platformAdmin ? t("admin.revokeAdmin") : t("admin.makeAdmin") }}
                      </UiButton>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <template v-else-if="section === 'rules'">
            <h2 class="text-xl font-semibold">{{ t("admin.rules") }}</h2>
            <p class="mt-2 text-sm text-ink-500">{{ t("admin.rulesHint") }}</p>
            <label v-for="layer in rules" :key="layer.id" class="mt-4 block">
              <span class="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{
                layer.level === "platform" ? t("rules.platform") : t("rules.project")
              }}</span>
              <textarea
                v-model="layer.body"
                class="mt-2 h-32 w-full rounded-[10px] border border-line bg-white/5 p-3 text-sm outline-none"
              />
            </label>
            <UiButton class="mt-4" :disabled="busy" @click="saveRules">
              {{ t("admin.saveRules") }}
            </UiButton>
          </template>

          <template v-else-if="section === 'flags' && overview">
            <h2 class="text-xl font-semibold">{{ t("admin.flags") }}</h2>
            <p class="mt-2 text-sm text-ink-500">{{ t("admin.flagsHint") }}</p>
            <label v-for="flag in (['publish', 'multiProvider', 'spectator', 'recipes'] as const)" :key="flag" class="mt-4 flex items-center justify-between">
              <span class="text-sm">{{ t(`flags.${flag}`) }}</span>
              <UiSwitch
                :model-value="!!overview.flags[flag]"
                :label="t(`flags.${flag}`)"
                @update:model-value="patchFlag(flag, $event)"
              />
            </label>
          </template>

          <template v-else-if="section === 'workspaces'">
            <h2 class="text-xl font-semibold">{{ t("admin.workspaces") }}</h2>
            <p class="mt-2 text-sm text-ink-500">{{ t("admin.workspacesHint") }}</p>
            <p v-if="!workspaces.length" class="mt-4 text-sm text-ink-400">{{ t("admin.noWorkspaces") }}</p>
            <article v-for="workspace in workspaces" :key="workspace.id" class="mt-3 rounded-2xl border border-line bg-canvas/50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="font-medium">{{ workspace.login }}</p>
                  <p class="font-mono text-[11px] text-ink-400">{{ workspace.branch }} · {{ workspace.status }}</p>
                </div>
                <UiButton
                  size="sm"
                  variant="outline"
                  :disabled="busy || workspace.status === 'hibernated'"
                  @click="hibernateWorkspace(workspace.id)"
                >
                  {{ t("admin.hibernate") }}
                </UiButton>
              </div>
              <p v-if="workspace.lastError" class="mt-2 text-[12px] text-amber-200">{{ workspace.lastError }}</p>
            </article>
          </template>
        </section>
      </div>
    </div>
  </main>
</template>
