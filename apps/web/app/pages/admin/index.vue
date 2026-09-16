<script setup lang="ts">
import {
  ArrowLeft,
  BookOpen,
  Flag,
  KeyRound,
  LayoutGrid,
  MonitorSmartphone,
  Sparkles,
  Users,
} from "@lucide/vue";

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
    repoOwner: boolean;
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

const sections: Array<{ id: Section; label: string; icon: typeof LayoutGrid }> = [
  { id: "overview", label: "admin.overview", icon: LayoutGrid },
  { id: "env", label: "admin.env", icon: KeyRound },
  { id: "providers", label: "admin.providers", icon: Sparkles },
  { id: "users", label: "admin.users", icon: Users },
  { id: "rules", label: "admin.rules", icon: BookOpen },
  { id: "flags", label: "admin.flags", icon: Flag },
  { id: "workspaces", label: "admin.workspaces", icon: MonitorSmartphone },
];

const current = computed(() => sections.find((item) => item.id === section.value) ?? sections[0]!);
const envEditor = ref<{ submit: () => void } | null>(null);

async function refreshData() {
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
}

async function load() {
  forbidden.value = false;
  try {
    const me = await $fetch<{ user: { platformAdmin?: boolean } }>("/api/me");
    if (!me.user.platformAdmin) {
      forbidden.value = true;
      return;
    }
    await refreshData();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    forbidden.value = status === 401 || status === 403;
    if (!forbidden.value) error.value = apiErrorMessage(err);
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

function apiErrorMessage(err: unknown): string {
  const row = err as {
    data?: { statusMessage?: string; message?: string };
    statusMessage?: string;
    message?: string;
  };
  const message = row?.data?.statusMessage || row?.data?.message || row?.statusMessage || row?.message;
  if (typeof message === "string" && /last platform admin/i.test(message)) {
    return t("admin.lastAdmin");
  }
  if (typeof message === "string" && /permanent platform admin|github repository owner/i.test(message)) {
    return t("admin.cannotRevokeOwner");
  }
  if (typeof message === "string" && /already hibernat/i.test(message)) {
    return t("admin.alreadyHibernated");
  }
  if (typeof message === "string" && /last running/i.test(message)) {
    return t("admin.lastRunning");
  }
  if (typeof message === "string" && message.trim() && !/^\[[A-Z]+\]\s+"/.test(message)) {
    return message;
  }
  return t("admin.error");
}

async function wrap(run: () => Promise<void>, onError?: (err: unknown) => string) {
  busy.value = true;
  error.value = "";
  try {
    await run();
    flash(t("admin.saved"));
  } catch (err) {
    error.value = onError?.(err) ?? apiErrorMessage(err);
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

async function toggleProvider(id: string, enabled: boolean) {
  const row = providers.value.find((item) => item.id === id);
  if (row) row.enabled = enabled;
  await wrap(async () => {
    const res = await $fetch<{ providers: typeof providers.value }>("/api/admin/providers", {
      method: "PUT",
      body: { id, enabled },
    });
    providers.value = res.providers;
  });
}

async function toggleAdmin(userId: string, next: boolean) {
  await wrap(async () => {
    const res = await $fetch<{ user: (typeof users.value)[number] }>(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: { platformAdmin: next },
    });
    const list = await $fetch<{ users: typeof users.value }>("/api/admin/users");
    users.value = list.users;
    if (res.user) {
      users.value = users.value.map((user) => (user.id === userId ? { ...user, ...res.user } : user));
    }
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

async function applyHibernatedRow(
  id: string,
  workspace?: { id: string; status: string; lastError: string | null },
) {
  const row = workspaces.value.find((item) => item.id === id);
  if (!row) return;
  row.status = workspace?.status ?? "hibernated";
  if (workspace) row.lastError = workspace.lastError;
}

async function refreshWorkspaces() {
  const [over, workspaceRes] = await Promise.all([
    $fetch<NonNullable<typeof overview.value>>("/api/admin/overview"),
    $fetch<{ workspaces: typeof workspaces.value }>("/api/admin/workspaces"),
  ]);
  overview.value = over;
  workspaces.value = workspaceRes.workspaces;
}

async function hibernateWorkspace(id: string) {
  busy.value = true;
  error.value = "";
  try {
    const res = await $fetch<{
      ok: boolean;
      workspace?: { id: string; status: string; lastError: string | null };
    }>(`/api/admin/workspaces/${id}/hibernate`, { method: "POST" });
    applyHibernatedRow(id, res.workspace);
    try {
      await refreshWorkspaces();
    } catch {
      applyHibernatedRow(id, res.workspace ?? { id, status: "hibernated", lastError: null });
    }
    flash(t("admin.hibernatedOk"));
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

function statusTone(status: string | null) {
  if (status === "running") return "live" as const;
  if (status === "error" || status === "hibernated") return "warn" as const;
  return "neutral" as const;
}
</script>

<template>
  <div class="admin-shell mesh flex h-screen flex-col overflow-hidden">
    <div class="grain pointer-events-none absolute inset-0 opacity-[0.07]" />
    <header class="menubar relative z-10 flex h-12 shrink-0 items-center gap-3 px-4">
      <NuxtLink to="/" class="flex items-center gap-2 text-ink-500 transition hover:text-ink-800">
        <ArrowLeft class="h-3.5 w-3.5" />
        <span class="text-[12px] font-medium">{{ t("admin.back") }}</span>
      </NuxtLink>
      <span class="h-3 w-px bg-white/10" />
      <UiLogo :size="22" />
      <p class="text-[13px] font-semibold tracking-tight">{{ t("admin.title") }}</p>
    </header>

    <p
      v-if="toast"
      class="absolute top-16 left-1/2 z-20 -translate-x-1/2 rounded-full border border-line bg-paper/90 px-4 py-1.5 text-[12px] font-medium text-ink-800 shadow-float backdrop-blur-xl"
    >
      {{ toast }}
    </p>

    <div v-if="loading" class="relative flex flex-1 items-center justify-center">
      <UiSpinner size="lg" :label="t('nav.working')" />
    </div>

    <div v-else-if="forbidden" class="relative flex flex-1 items-center justify-center px-6">
      <div class="admin-panel max-w-md p-8">
        <h1 class="text-xl font-semibold tracking-tight">{{ t("admin.forbidden") }}</h1>
        <NuxtLink to="/" class="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-coral-400">
          <ArrowLeft class="h-3.5 w-3.5" /> {{ t("admin.back") }}
        </NuxtLink>
      </div>
    </div>

    <div v-else class="relative flex min-h-0 flex-1">
      <nav class="admin-rail hidden w-[232px] shrink-0 flex-col p-2 lg:flex">
        <p class="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-ink-300 uppercase">
          {{ t("admin.title") }}
        </p>
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          class="mt-0.5 flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[13px] transition"
          :class="
            section === item.id
              ? 'bg-white/[0.07] font-medium text-ink-950'
              : 'text-ink-500 hover:bg-white/[0.04] hover:text-ink-800'
          "
          @click="section = item.id"
        >
          <component :is="item.icon" class="h-3.5 w-3.5 shrink-0 opacity-80" />
          {{ t(item.label) }}
        </button>
      </nav>

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 lg:hidden">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            class="rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap"
            :class="section === item.id ? 'bg-white/10 text-ink-950' : 'text-ink-500'"
            @click="section = item.id"
          >
            {{ t(item.label) }}
          </button>
        </div>

        <main class="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
          <div class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
            <p v-if="error" class="mb-4 shrink-0 text-[13px] text-red-400">{{ error }}</p>
            <div class="mb-6 shrink-0">
              <h1 class="text-[22px] font-semibold tracking-tight">{{ t(current.label) }}</h1>
              <p
                v-if="section !== 'overview'"
                class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-500"
              >
                {{
                  section === "env"
                    ? t("admin.envHint")
                    : section === "providers"
                      ? t("admin.providersHint")
                      : section === "users"
                        ? t("admin.usersHint")
                        : section === "rules"
                          ? t("admin.rulesHint")
                          : section === "flags"
                            ? t("admin.flagsHint")
                            : t("admin.workspacesHint")
                }}
              </p>
              <p v-else class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-500">
                {{ t("admin.lede") }}
              </p>
            </div>

            <div v-if="section === 'overview' && overview" class="thin-scroll min-h-0 flex-1 overflow-y-auto">
              <p class="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-300 uppercase">
                {{ t("admin.fleet") }}
              </p>
              <div class="admin-panel mb-6 grid grid-cols-2 sm:grid-cols-4">
                <div class="admin-stat">
                  <p class="text-[11px] text-ink-400">{{ t("admin.userCount") }}</p>
                  <p class="mt-1 font-display text-[28px] leading-none">{{ overview.users }}</p>
                </div>
                <div class="admin-stat">
                  <p class="text-[11px] text-ink-400">{{ t("admin.running") }}</p>
                  <p class="mt-1 font-display text-[28px] leading-none text-emerald-300">{{ overview.running }}</p>
                </div>
                <div class="admin-stat">
                  <p class="text-[11px] text-ink-400">{{ t("admin.hibernated") }}</p>
                  <p class="mt-1 font-display text-[28px] leading-none">{{ overview.hibernated }}</p>
                </div>
                <div class="admin-stat">
                  <p class="text-[11px] text-ink-400">{{ t("admin.errored") }}</p>
                  <p class="mt-1 font-display text-[28px] leading-none" :class="overview.error ? 'text-amber-200' : ''">
                    {{ overview.error }}
                  </p>
                </div>
              </div>

              <p class="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-300 uppercase">
                {{ t("admin.health") }}
              </p>
              <div class="admin-panel">
                <div class="admin-row">
                  <div>
                    <p class="text-[13px] font-medium">{{ t("admin.github") }}</p>
                    <p class="mt-0.5 text-[12px] text-ink-400">{{ t("admin.githubHint") }}</p>
                  </div>
                  <UiBadge :tone="overview.githubConfigured ? 'live' : 'warn'">
                    {{ overview.githubConfigured ? t("admin.configured") : t("admin.missing") }}
                  </UiBadge>
                </div>
                <div class="admin-row">
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium">{{ t("admin.publicUrl") }}</p>
                    <p class="mt-0.5 text-[12px] text-ink-400">{{ t("admin.publicUrlHint") }}</p>
                  </div>
                  <p class="font-mono text-[12px] text-ink-700">{{ overview.publicUrl }}</p>
                </div>
              </div>
              <div v-if="overview.lastPreviewError" class="admin-panel mt-4 px-4 py-3">
                <p class="text-[11px] font-medium text-amber-200">{{ t("admin.lastError") }}</p>
                <p class="mt-1 text-[13px] leading-relaxed text-ink-600">{{ overview.lastPreviewError }}</p>
              </div>
              <p v-else class="mt-4 text-[12px] text-ink-400">{{ t("admin.noError") }}</p>
            </div>

            <div v-else-if="section === 'env'" class="admin-panel flex min-h-0 flex-1 flex-col">
              <div class="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <AdminEnvEditor
                  ref="envEditor"
                  :env="env.env"
                  :raw="env.raw"
                  :show-footer="false"
                  reveal-url="/api/admin/env"
                  @save="saveEnv"
                />
              </div>
              <div class="admin-action-bar">
                <UiButton size="sm" variant="ghost" :disabled="busy" @click="applyEnv">
                  {{ t("admin.applyEnv") }}
                </UiButton>
                <UiButton size="sm" :disabled="busy" @click="envEditor?.submit()">
                  {{ t("admin.saveEnv") }}
                </UiButton>
              </div>
            </div>

            <div v-else class="thin-scroll min-h-0 flex-1 overflow-y-auto">
            <template v-if="section === 'providers'">
              <AdminProvidersList
                :providers="providers"
                v-model:keys="providerKeys"
                :busy="busy"
                @toggle="toggleProvider"
                @save="saveProvider"
              />
            </template>

            <template v-else-if="section === 'users'">
              <div v-if="!users.length" class="admin-panel px-4 py-8 text-center text-[13px] text-ink-400">
                {{ t("admin.noUsers") }}
              </div>
              <div v-else class="admin-panel">
                <div v-for="user in users" :key="user.id" class="admin-row">
                  <div class="flex min-w-0 items-center gap-3">
                    <UiAvatar :name="user.login" />
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="text-[13px] font-medium">{{ user.login }}</p>
                        <UiBadge v-if="user.platformAdmin" tone="info">{{ t("admin.adminBadge") }}</UiBadge>
                        <UiBadge v-if="user.accessPending" tone="warn">{{ t("admin.pending") }}</UiBadge>
                      </div>
                      <p class="mt-0.5 text-[12px] text-ink-400">
                        {{ user.role }}
                        <span v-if="user.workspaceStatus"> · {{ user.workspaceStatus }}</span>
                      </p>
                    </div>
                  </div>
                  <p v-if="user.repoOwner" class="text-[11px] text-ink-400">{{ t("admin.ownerLocked") }}</p>
                  <p v-else-if="user.envAdmin" class="text-[11px] text-ink-400">{{ t("admin.envLocked") }}</p>
                  <UiButton
                    v-else
                    size="sm"
                    variant="outline"
                    :disabled="busy"
                    @click="toggleAdmin(user.id, !user.platformAdmin)"
                  >
                    {{ user.platformAdmin ? t("admin.revokeAdmin") : t("admin.makeAdmin") }}
                  </UiButton>
                </div>
              </div>
            </template>

            <template v-else-if="section === 'rules'">
              <div class="admin-panel p-4 sm:p-5">
                <label v-for="layer in rules" :key="layer.id" class="mb-4 block last:mb-0">
                  <span class="text-[11px] font-medium tracking-[0.14em] text-ink-300 uppercase">{{
                    layer.level === "platform" ? t("rules.platform") : t("rules.project")
                  }}</span>
                  <textarea
                    v-model="layer.body"
                    class="mt-2 h-32 w-full rounded-[10px] border border-line bg-black/20 p-3 text-[13px] leading-relaxed outline-none focus:border-coral-500/40"
                  />
                </label>
                <UiButton class="mt-1" :disabled="busy" @click="saveRules">
                  {{ t("admin.saveRules") }}
                </UiButton>
              </div>
            </template>

            <template v-else-if="section === 'flags' && overview">
              <div class="admin-panel">
                <div
                  v-for="flag in (['publish', 'multiProvider', 'spectator', 'recipes'] as const)"
                  :key="flag"
                  class="admin-row"
                >
                  <span class="text-[13px]">{{ t(`flags.${flag}`) }}</span>
                  <UiSwitch
                    :model-value="!!overview.flags[flag]"
                    :label="t(`flags.${flag}`)"
                    @update:model-value="patchFlag(flag, $event)"
                  />
                </div>
              </div>
            </template>

            <template v-else-if="section === 'workspaces'">
              <div v-if="!workspaces.length" class="admin-panel px-4 py-8 text-center text-[13px] text-ink-400">
                {{ t("admin.noWorkspaces") }}
              </div>
              <div v-else class="admin-panel">
                <div v-for="workspace in workspaces" :key="workspace.id" class="admin-row">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-[13px] font-medium">{{ workspace.login }}</p>
                      <UiBadge :tone="statusTone(workspace.status)">{{ workspace.status }}</UiBadge>
                    </div>
                    <p class="mt-0.5 font-mono text-[11px] text-ink-400">{{ workspace.branch }}</p>
                    <p v-if="workspace.lastError" class="mt-1 text-[12px] text-amber-200">{{ workspace.lastError }}</p>
                  </div>
                  <UiButton
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="busy || workspace.status === 'hibernated'"
                    @click.prevent="hibernateWorkspace(workspace.id)"
                  >
                    {{ t("admin.hibernate") }}
                  </UiButton>
                </div>
              </div>
            </template>
          </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
