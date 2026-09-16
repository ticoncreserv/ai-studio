<script setup lang="ts">
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Flag,
  KeyRound,
  LayoutGrid,
  LogOut,
  MonitorSmartphone,
  Search,
  Sparkles,
  TriangleAlert,
  Users,
} from "@lucide/vue";

const { t } = useI18n();
const relativeTime = useRelativeTime();

type Section = "overview" | "errors" | "env" | "providers" | "users" | "rules" | "flags" | "workspaces";

type ErrorHint = { id: string; title: string; detail: string; action?: string };
type AdminError = {
  id: string;
  userId: string;
  login: string;
  branch: string;
  status: string;
  lastError: string | null;
  errorAt: string | null;
  lastActiveAt: string;
  previewPath: string | null;
  hasArtisanLog: boolean;
  hasViteLog: boolean;
  hints: ErrorHint[];
};

const section = ref<Section>("overview");
const loading = ref(true);
const forbidden = ref(false);
const toast = ref("");
const error = ref("");
const busy = ref(false);
const query = ref("");
const bannerDismissed = ref(false);

const overview = ref<{
  githubConfigured: boolean;
  cursorKey: boolean;
  publicUrl: string;
  users: number;
  running: number;
  hibernated: number;
  error: number;
  lastPreviewError: string | null;
  lastPreviewErrorLogin: string | null;
  lastPreviewErrorAt: string | null;
  lastPreviewErrorWorkspaceId: string | null;
  flags: Record<string, boolean>;
} | null>(null);
const env = ref<{ env: Record<string, string>; raw: string; secrets?: Record<string, string> }>({ env: {}, raw: "" });
const providers = ref<
  Array<{ id: string; label: string; enabled: boolean; implemented: boolean; hasKey: boolean }>
>([]);
const providerKeys = ref<Record<string, string>>({});
const signedIn = ref<{ login: string; name: string } | null>(null);
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
    disabled: boolean;
    canDisable: boolean;
    workspaceId: string | null;
    workspaceStatus: string | null;
    lastActiveAt: string | null;
  }>
>([]);
const rules = ref<Array<{ id: string; level: "platform" | "project" | "user"; title: string; body: string }>>([]);
const workspaces = ref<
  Array<{
    id: string;
    userId: string;
    login: string;
    branch: string;
    status: string;
    lastError: string | null;
    lastActiveAt: string;
    port: number | null;
    vitePort: number | null;
    bytes: number | null;
    worktree: string;
    previewPath: string | null;
    canDeactivateUser: boolean;
  }>
>([]);

const pendingDestroy = ref<{ id: string; login: string; canDeactivate: boolean } | null>(null);
const pendingDisable = ref<{ id: string; login: string; hasWorkspace: boolean } | null>(null);
const alsoDeactivate = ref(false);
const alsoDestroy = ref(false);
const listQuery = ref("");
const errors = ref<AdminError[]>([]);
const expandedErrorId = ref<string | null>(null);
const errorLogs = ref<{ artisan: string; vite: string } | null>(null);
const logBusy = ref(false);

type NavItem = { id: Section; label: string; icon: typeof LayoutGrid };

const navGroups: NavItem[][] = [
  [
    { id: "overview", label: "admin.overview", icon: LayoutGrid },
    { id: "errors", label: "admin.errors", icon: TriangleAlert },
    { id: "env", label: "admin.env", icon: KeyRound },
    { id: "providers", label: "admin.providers", icon: Sparkles },
  ],
  [
    { id: "users", label: "admin.users", icon: Users },
    { id: "workspaces", label: "admin.workspaces", icon: MonitorSmartphone },
  ],
  [
    { id: "rules", label: "admin.rules", icon: BookOpen },
    { id: "flags", label: "admin.flags", icon: Flag },
  ],
];

const sections = navGroups.flat();
const flagList = ["publish", "multiProvider", "spectator", "recipes"] as const;

function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const visibleGroups = computed(() => {
  const needle = fold(query.value.trim());
  if (!needle) return navGroups;
  return navGroups
    .map((group) => group.filter((item) => fold(t(item.label)).includes(needle)))
    .filter((group) => group.length > 0);
});

const current = computed(() => sections.find((item) => item.id === section.value) ?? sections[0]!);
const showSetupBanner = computed(
  () =>
    section.value === "overview" &&
    !bannerDismissed.value &&
    Boolean(overview.value) &&
    (!overview.value!.githubConfigured || !overview.value!.cursorKey),
);

const filteredUsers = computed(() => {
  const needle = fold(listQuery.value.trim());
  if (!needle) return users.value;
  return users.value.filter((user) => {
    const haystack = [user.login, user.name, user.role, user.workspaceStatus ?? ""]
      .map((part) => fold(String(part)))
      .join(" ");
    return haystack.includes(needle);
  });
});

const filteredWorkspaces = computed(() => {
  const needle = fold(listQuery.value.trim());
  if (!needle) return workspaces.value;
  return workspaces.value.filter((workspace) => {
    const haystack = [
      workspace.login,
      workspace.branch,
      workspace.status,
      workspace.worktree,
      workspace.lastError ?? "",
      workspace.previewPath ?? "",
      workspace.port != null ? String(workspace.port) : "",
      workspace.vitePort != null ? String(workspace.vitePort) : "",
    ]
      .map((part) => fold(String(part)))
      .join(" ");
    return haystack.includes(needle);
  });
});

const filteredErrors = computed(() => {
  const needle = fold(listQuery.value.trim());
  if (!needle) return errors.value;
  return errors.value.filter((row) => {
    const haystack = [row.login, row.branch, row.status, row.lastError ?? ""]
      .map((part) => fold(String(part)))
      .join(" ");
    return haystack.includes(needle);
  });
});

const envEditor = ref<{ submit: () => void } | null>(null);

async function refreshData() {
  const [over, envRes, providerRes, userRes, ruleRes, workspaceRes, errorRes] = await Promise.all([
    $fetch<NonNullable<typeof overview.value>>("/api/admin/overview"),
    $fetch<{ env: Record<string, string>; raw: string }>("/api/admin/env"),
    $fetch<{ providers: typeof providers.value }>("/api/admin/providers"),
    $fetch<{ users: typeof users.value }>("/api/admin/users"),
    $fetch<{ rules: typeof rules.value }>("/api/admin/rules"),
    $fetch<{ workspaces: typeof workspaces.value }>("/api/admin/workspaces"),
    $fetch<{ errors: AdminError[] }>("/api/admin/errors"),
  ]);
  overview.value = over;
  env.value = envRes;
  providers.value = providerRes.providers;
  users.value = userRes.users;
  rules.value = ruleRes.rules;
  workspaces.value = workspaceRes.workspaces;
  errors.value = errorRes.errors;
}

async function load() {
  forbidden.value = false;
  try {
    const me = await $fetch<{ user: { login: string; name: string; platformAdmin?: boolean; disabled?: boolean } }>(
      "/api/me",
    );
    if (me.user.disabled) {
      await navigateTo("/disabled");
      return;
    }
    if (!me.user.platformAdmin) {
      forbidden.value = true;
      return;
    }
    signedIn.value = { login: me.user.login, name: me.user.name };
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
  if (typeof message === "string" && /cannot disable the permanent/i.test(message)) {
    return t("admin.cannotDisableOwner");
  }
  if (typeof message === "string" && /cannot disable an env-listed/i.test(message)) {
    return t("admin.cannotDisableEnv");
  }
  if (typeof message === "string" && /workspace not found/i.test(message)) {
    return t("admin.workspaceGone");
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
  listQuery.value = "";
});

async function signOut() {
  await $fetch("/api/auth/logout", { method: "POST" });
  await navigateTo("/");
}

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
  const [over, workspaceRes, errorRes] = await Promise.all([
    $fetch<NonNullable<typeof overview.value>>("/api/admin/overview"),
    $fetch<{ workspaces: typeof workspaces.value }>("/api/admin/workspaces"),
    $fetch<{ errors: AdminError[] }>("/api/admin/errors"),
  ]);
  overview.value = over;
  workspaces.value = workspaceRes.workspaces;
  errors.value = errorRes.errors;
}

async function toggleErrorDetails(row: AdminError) {
  if (expandedErrorId.value === row.id) {
    expandedErrorId.value = null;
    errorLogs.value = null;
    return;
  }
  expandedErrorId.value = row.id;
  errorLogs.value = null;
  if (!row.hasArtisanLog && !row.hasViteLog) return;
  logBusy.value = true;
  try {
    const logs = await $fetch<{ artisan: string; vite: string }>(`/api/admin/workspaces/${row.id}/logs`);
    errorLogs.value = { artisan: logs.artisan, vite: logs.vite };
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    logBusy.value = false;
  }
}

async function resumeWorkspace(id: string) {
  busy.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/workspaces/${id}/resume`, { method: "POST" });
    await refreshData();
    flash(t("admin.resumedOk"));
  } catch (err) {
    error.value = apiErrorMessage(err);
    await refreshData().catch(() => undefined);
  } finally {
    busy.value = false;
  }
}

async function clearError(id: string) {
  busy.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/workspaces/${id}/clear-error`, { method: "POST" });
    if (expandedErrorId.value === id) {
      expandedErrorId.value = null;
      errorLogs.value = null;
    }
    await refreshData();
    flash(t("admin.clearedOk"));
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    flash(t("admin.copied"));
  } catch {
    error.value = t("admin.error");
  }
}

function runHintAction(row: AdminError, hint: ErrorHint) {
  if (hint.action === "resume") void resumeWorkspace(row.id);
  else if (hint.action === "hibernate") void hibernateWorkspace(row.id);
  else if (hint.action === "destroy") {
    alsoDeactivate.value = false;
    pendingDestroy.value = { id: row.id, login: row.login, canDeactivate: true };
  } else if (hint.action === "openEnv") section.value = "env";
  else if (hint.action === "openWorkspace") void navigateTo(`/w/${row.id}`);
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

function requestDestroy(workspace: (typeof workspaces.value)[number]) {
  alsoDeactivate.value = false;
  pendingDestroy.value = {
    id: workspace.id,
    login: workspace.login,
    canDeactivate: workspace.canDeactivateUser,
  };
}

function cancelDestroy() {
  pendingDestroy.value = null;
  alsoDeactivate.value = false;
}

async function confirmDestroy() {
  const pending = pendingDestroy.value;
  if (!pending) return;
  busy.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/workspaces/${pending.id}/destroy`, {
      method: "POST",
      body: { deactivateUser: pending.canDeactivate && alsoDeactivate.value },
    });
    pendingDestroy.value = null;
    alsoDeactivate.value = false;
    await refreshData();
    flash(t("admin.deletedOk"));
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

function requestDisable(user: (typeof users.value)[number]) {
  alsoDestroy.value = false;
  pendingDisable.value = {
    id: user.id,
    login: user.login,
    hasWorkspace: Boolean(user.workspaceId),
  };
}

function cancelDisable() {
  pendingDisable.value = null;
  alsoDestroy.value = false;
}

async function confirmDisable() {
  const pending = pendingDisable.value;
  if (!pending) return;
  busy.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/users/${pending.id}`, {
      method: "PATCH",
      body: { disabled: true, destroyWorkspace: pending.hasWorkspace && alsoDestroy.value },
    });
    pendingDisable.value = null;
    alsoDestroy.value = false;
    await refreshData();
    flash(t("admin.deactivatedOk"));
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function reactivateUser(userId: string) {
  busy.value = true;
  error.value = "";
  try {
    await $fetch(`/api/admin/users/${userId}`, { method: "PATCH", body: { disabled: false } });
    await refreshData();
    flash(t("admin.reactivatedOk"));
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

function formatBytes(bytes: number | null) {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortWorktree(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

function statusTone(status: string | null) {
  if (status === "running") return "live" as const;
  if (status === "error" || status === "hibernated") return "warn" as const;
  return "neutral" as const;
}

function statusLabel(status: string | null) {
  if (status === "running") return t("admin.statusRunning");
  if (status === "ready") return t("admin.statusReady");
  if (status === "hibernated") return t("admin.statusHibernated");
  if (status === "error") return t("admin.statusError");
  if (status === "provisioning") return t("admin.statusProvisioning");
  if (status === "starting") return t("admin.statusStarting");
  if (status === "destroyed") return t("admin.statusDestroyed");
  return status ?? "";
}

function ruleLabel(level: "platform" | "project" | "user") {
  if (level === "platform") return t("rules.platform");
  if (level === "project") return t("rules.project");
  return t("rules.user");
}

function ruleHint(level: "platform" | "project" | "user") {
  if (level === "platform") return t("rules.platformHint");
  if (level === "project") return t("rules.projectHint");
  return t("rules.userHint");
}
</script>

<template>
  <div class="admin-shell relative flex h-screen flex-col overflow-hidden">
    <header class="menubar cx-mobile-only shrink-0">
      <NuxtLink to="/" class="flex items-center gap-2 text-ink-500 transition-colors hover:text-ink-950">
        <ArrowLeft class="h-3.5 w-3.5" />
        <span class="text-[12px]">{{ t("admin.back") }}</span>
      </NuxtLink>
      <span class="ml-auto text-[12px] text-ink-400">{{ t("admin.title") }}</span>
    </header>

    <p v-if="toast" class="cx-toast absolute top-4 left-1/2 z-20 -translate-x-1/2">{{ toast }}</p>

    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <UiSpinner size="lg" :label="t('nav.working')" />
    </div>

    <div v-else-if="forbidden" class="flex flex-1 items-center justify-center px-6">
      <div class="cx-panel max-w-sm p-6">
        <h1 class="cx-settings-title">{{ t("admin.forbidden") }}</h1>
        <NuxtLink to="/" class="cx-link mt-3 inline-flex items-center gap-1.5">
          <ArrowLeft class="h-3.5 w-3.5" /> {{ t("admin.back") }}
        </NuxtLink>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1">
      <nav class="admin-rail hidden w-[220px] shrink-0 flex-col lg:flex">
        <div class="shrink-0 p-2">
          <NuxtLink to="/" class="cx-nav-item">
            <ArrowLeft class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ t("admin.back") }}</span>
          </NuxtLink>
          <div class="cx-search mt-1.5">
            <Search class="h-3 w-3 shrink-0 text-ink-400" />
            <input
              v-model="query"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :placeholder="t('admin.searchSettings')"
              :aria-label="t('admin.searchSettings')"
            />
          </div>
        </div>
        <div class="thin-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <div v-for="(group, index) in visibleGroups" :key="index" :class="index ? 'mt-3.5' : ''" class="cx-nav-stack">
            <button
              v-for="item in group"
              :key="item.id"
              type="button"
              class="cx-nav-item"
              :data-active="section === item.id"
              @click="section = item.id"
            >
              <component :is="item.icon" class="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span class="truncate">{{ t(item.label) }}</span>
            </button>
          </div>
          <p v-if="!visibleGroups.length" class="px-2 py-1.5 text-[12px] text-ink-400">{{ t("admin.noMatches") }}</p>
        </div>
        <div class="cx-account shrink-0">
          <UiAvatar :name="signedIn?.login ?? ''" size="sm" />
          <span class="cx-account-name">{{ signedIn?.login }}</span>
          <UiIconButton size="sm" :label="t('nav.signOut')" @click="signOut">
            <LogOut class="h-3.5 w-3.5" />
          </UiIconButton>
        </div>
      </nav>

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="cx-tabstrip cx-mobile-only shrink-0">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            class="cx-tab"
            :data-active="section === item.id"
            @click="section = item.id"
          >
            {{ t(item.label) }}
          </button>
        </div>

        <main
          class="flex min-h-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:pt-3.5 lg:pb-8"
          :class="section === 'env' ? 'overflow-hidden' : 'thin-scroll overflow-y-auto'"
        >
          <div class="mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col">
            <div v-if="showSetupBanner" class="cx-banner shrink-0">
              <div class="min-w-0">
                <p class="cx-row-title">{{ t("admin.setupBannerTitle") }}</p>
                <p class="cx-row-desc">{{ t("admin.setupBannerBody") }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <UiButton size="sm" variant="ghost" @click="bannerDismissed = true">{{ t("admin.dismiss") }}</UiButton>
                <UiButton size="sm" variant="outline" @click="section = 'env'">
                  {{ t("admin.openEnv") }}
                  <ArrowUpRight class="h-3 w-3" />
                </UiButton>
              </div>
            </div>

            <div class="shrink-0">
              <h1 class="cx-settings-title">{{ t(current.label) }}</h1>
              <p v-if="error" class="mt-1.5 text-[12px] text-red-300">{{ error }}</p>
            </div>

            <div class="mt-4 flex min-h-0 flex-1 flex-col">
              <template v-if="section === 'overview' && overview">
                <section class="cx-section">
                  <p class="cx-section-label">{{ t("admin.fleet") }}</p>
                  <p class="cx-section-note">{{ t("admin.lede") }}</p>
                  <div class="cx-panel cx-stat-grid">
                    <div class="cx-stat-cell">
                      <p class="cx-stat-label">{{ t("admin.userCount") }}</p>
                      <p class="cx-stat-value">{{ overview.users }}</p>
                    </div>
                    <div class="cx-stat-cell">
                      <p class="cx-stat-label">{{ t("admin.running") }}</p>
                      <p class="cx-stat-value cx-tone-ok">{{ overview.running }}</p>
                    </div>
                    <div class="cx-stat-cell">
                      <p class="cx-stat-label">{{ t("admin.hibernated") }}</p>
                      <p class="cx-stat-value">{{ overview.hibernated }}</p>
                    </div>
                    <div class="cx-stat-cell">
                      <p class="cx-stat-label">{{ t("admin.errored") }}</p>
                      <p class="cx-stat-value" :class="overview.error ? 'cx-tone-warn' : ''">{{ overview.error }}</p>
                    </div>
                  </div>
                </section>

                <section class="cx-section">
                  <p class="cx-section-label">{{ t("admin.health") }}</p>
                  <div class="cx-panel">
                    <div class="cx-row">
                      <div class="min-w-0">
                        <p class="cx-row-title">{{ t("admin.github") }}</p>
                        <p class="cx-row-desc">{{ t("admin.githubHint") }}</p>
                      </div>
                      <UiBadge :tone="overview.githubConfigured ? 'live' : 'warn'">
                        {{ overview.githubConfigured ? t("admin.configured") : t("admin.missing") }}
                      </UiBadge>
                    </div>
                    <div class="cx-row">
                      <div class="min-w-0">
                        <p class="cx-row-title">{{ t("admin.cursorKey") }}</p>
                        <p class="cx-row-desc">{{ t("admin.cursorKeyHint") }}</p>
                      </div>
                      <UiBadge :tone="overview.cursorKey ? 'live' : 'warn'">
                        {{ overview.cursorKey ? t("admin.configured") : t("admin.missing") }}
                      </UiBadge>
                    </div>
                    <div class="cx-row">
                      <div class="min-w-0">
                        <p class="cx-row-title">{{ t("admin.publicUrl") }}</p>
                        <p class="cx-row-desc">{{ t("admin.publicUrlHint") }}</p>
                      </div>
                      <a
                        class="cx-link cx-value-mono inline-flex shrink-0 items-center gap-1"
                        :href="overview.publicUrl"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {{ overview.publicUrl }}
                        <ArrowUpRight class="h-3 w-3" />
                      </a>
                    </div>
                    <div class="cx-row cx-row-top">
                      <div class="min-w-0">
                        <p class="cx-row-title">{{ t("admin.lastError") }}</p>
                        <p class="cx-row-desc" :class="overview.lastPreviewError ? 'cx-tone-warn' : ''">
                          <template v-if="overview.lastPreviewError">
                            <span v-if="overview.lastPreviewErrorLogin">{{ overview.lastPreviewErrorLogin }} · </span>
                            {{ overview.lastPreviewError }}
                          </template>
                          <template v-else>{{ t("admin.noError") }}</template>
                        </p>
                        <p v-if="overview.lastPreviewErrorAt" class="cx-row-desc">
                          {{ relativeTime(overview.lastPreviewErrorAt) }}
                        </p>
                      </div>
                      <div class="flex shrink-0 flex-col items-end gap-1.5">
                        <UiBadge v-if="overview.lastPreviewError" tone="warn">{{ t("admin.statusError") }}</UiBadge>
                        <UiButton
                          v-if="overview.lastPreviewError"
                          size="sm"
                          variant="outline"
                          @click="section = 'errors'"
                        >
                          {{ t("admin.openErrors") }}
                        </UiButton>
                      </div>
                    </div>
                  </div>
                </section>
              </template>

              <template v-else-if="section === 'errors'">
                <section class="cx-section">
                  <p class="cx-section-label">{{ t("admin.errorsSection") }}</p>
                  <p class="cx-section-note">{{ t("admin.errorsHint") }}</p>
                  <div class="cx-search mb-2">
                    <Search class="h-3 w-3 shrink-0 text-ink-400" />
                    <input
                      v-model="listQuery"
                      type="text"
                      autocomplete="off"
                      :placeholder="t('admin.searchErrors')"
                      :aria-label="t('admin.searchErrors')"
                    />
                  </div>
                  <div v-if="!errors.length" class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400">
                    {{ t("admin.noErrors") }}
                  </div>
                  <div
                    v-else-if="!filteredErrors.length"
                    class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400"
                  >
                    {{ t("admin.noErrorMatches") }}
                  </div>
                  <div v-else class="space-y-2">
                    <div v-for="row in filteredErrors" :key="row.id" class="cx-panel">
                      <div class="cx-row cx-row-top cx-row-wrap">
                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-1.5">
                            <p class="cx-row-title">{{ row.login || row.id.slice(0, 8) }}</p>
                            <UiBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</UiBadge>
                          </div>
                          <p class="cx-row-desc font-mono">{{ row.branch }}</p>
                          <p class="cx-row-desc cx-tone-warn whitespace-pre-wrap break-words">
                            {{ row.lastError }}
                          </p>
                          <p v-if="row.errorAt" class="cx-row-desc">{{ relativeTime(row.errorAt) }}</p>
                        </div>
                        <div class="cx-row-actions flex shrink-0 flex-wrap justify-end gap-1.5">
                          <UiButton size="sm" variant="outline" :disabled="busy" @click="resumeWorkspace(row.id)">
                            {{ t("admin.retryPreview") }}
                          </UiButton>
                          <UiButton size="sm" variant="ghost" :disabled="busy" @click="toggleErrorDetails(row)">
                            {{
                              expandedErrorId === row.id ? t("admin.hideLogs") : t("admin.showLogs")
                            }}
                          </UiButton>
                          <UiButton
                            v-if="row.lastError"
                            size="sm"
                            variant="ghost"
                            @click="copyText(row.lastError)"
                          >
                            {{ t("admin.copyError") }}
                          </UiButton>
                          <UiButton size="sm" variant="ghost" :disabled="busy" @click="clearError(row.id)">
                            {{ t("admin.clearError") }}
                          </UiButton>
                          <UiButton size="sm" variant="ghost" :disabled="busy" @click="hibernateWorkspace(row.id)">
                            {{ t("admin.hibernate") }}
                          </UiButton>
                        </div>
                      </div>
                      <div v-if="row.hints.length" class="border-t border-line px-3.5 py-2.5">
                        <p class="cx-section-label mb-1.5">{{ t("admin.suggestedFixes") }}</p>
                        <div class="space-y-2">
                          <div v-for="hint in row.hints" :key="hint.id" class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <p class="cx-row-title">{{ hint.title }}</p>
                              <p class="cx-row-desc">{{ hint.detail }}</p>
                            </div>
                            <UiButton
                              v-if="hint.action"
                              size="sm"
                              variant="outline"
                              :disabled="busy"
                              @click="runHintAction(row, hint)"
                            >
                              {{ t("admin.applyFix") }}
                            </UiButton>
                          </div>
                        </div>
                      </div>
                      <div v-if="expandedErrorId === row.id" class="border-t border-line px-3.5 py-2.5">
                        <p v-if="logBusy" class="cx-row-desc">{{ t("nav.working") }}</p>
                        <template v-else-if="errorLogs">
                          <p class="cx-section-label">artisan</p>
                          <pre class="cx-log thin-scroll mb-2 max-h-48 overflow-auto">{{
                            errorLogs.artisan || t("admin.emptyLog")
                          }}</pre>
                          <p class="cx-section-label">vite</p>
                          <pre class="cx-log thin-scroll max-h-48 overflow-auto">{{
                            errorLogs.vite || t("admin.emptyLog")
                          }}</pre>
                        </template>
                        <p v-else class="cx-row-desc">{{ t("admin.emptyLog") }}</p>
                      </div>
                    </div>
                  </div>
                </section>
              </template>

              <section v-else-if="section === 'env'" class="cx-section flex min-h-0 flex-1 flex-col">
                <p class="cx-section-label shrink-0">{{ t("admin.envSection") }}</p>
                <p class="cx-section-note shrink-0">{{ t("admin.envHint") }}</p>
                <div class="cx-panel flex min-h-0 flex-1 flex-col">
                  <AdminEnvEditor
                    ref="envEditor"
                    class="min-h-0 flex-1"
                    :env="env.env"
                    :raw="env.raw"
                    :secrets="env.secrets"
                    :show-footer="false"
                    @save="saveEnv"
                  />
                  <div class="admin-action-bar shrink-0">
                    <UiButton size="sm" variant="ghost" :disabled="busy" @click="applyEnv">
                      {{ t("admin.applyEnv") }}
                    </UiButton>
                    <UiButton size="sm" variant="outline" :disabled="busy" @click="envEditor?.submit()">
                      {{ t("admin.saveEnv") }}
                    </UiButton>
                  </div>
                </div>
              </section>

              <AdminProvidersList
                v-else-if="section === 'providers'"
                v-model:keys="providerKeys"
                :providers="providers"
                :busy="busy"
                @toggle="toggleProvider"
                @save="saveProvider"
              />

              <section v-else-if="section === 'users'" class="cx-section">
                <p class="cx-section-label">{{ t("admin.usersSection") }}</p>
                <p class="cx-section-note">{{ t("admin.usersHint") }}</p>
                <div class="cx-search mb-2">
                  <Search class="h-3 w-3 shrink-0 text-ink-400" />
                  <input
                    v-model="listQuery"
                    type="text"
                    autocomplete="off"
                    :placeholder="t('admin.searchUsers')"
                    :aria-label="t('admin.searchUsers')"
                  />
                </div>
                <div v-if="!users.length" class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400">
                  {{ t("admin.noUsers") }}
                </div>
                <div
                  v-else-if="!filteredUsers.length"
                  class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400"
                >
                  {{ t("admin.noUserMatches") }}
                </div>
                <div v-else class="cx-panel">
                  <div v-for="user in filteredUsers" :key="user.id" class="cx-row cx-row-wrap">
                    <div class="flex min-w-0 items-center gap-2.5">
                      <UiAvatar :name="user.login" />
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <p class="cx-row-title">{{ user.login }}</p>
                          <UiBadge v-if="user.platformAdmin" tone="info">{{ t("admin.adminBadge") }}</UiBadge>
                          <UiBadge v-if="user.accessPending" tone="warn">{{ t("admin.pending") }}</UiBadge>
                          <UiBadge v-if="user.disabled" tone="warn">{{ t("admin.disabledBadge") }}</UiBadge>
                        </div>
                        <p class="cx-row-desc">
                          {{ user.role }}
                          <span v-if="user.workspaceStatus"> · {{ statusLabel(user.workspaceStatus) }}</span>
                          <span v-else-if="!user.disabled"> · {{ t("admin.noWorkspace") }}</span>
                        </p>
                      </div>
                    </div>
                    <div class="cx-row-actions flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <p v-if="user.repoOwner" class="cx-value text-right">{{ t("admin.ownerLocked") }}</p>
                      <p v-else-if="user.envAdmin" class="cx-value text-right">{{ t("admin.envLocked") }}</p>
                      <UiButton
                        v-else
                        size="sm"
                        variant="outline"
                        :disabled="busy"
                        @click="toggleAdmin(user.id, !user.platformAdmin)"
                      >
                        {{ user.platformAdmin ? t("admin.revokeAdmin") : t("admin.makeAdmin") }}
                      </UiButton>
                      <UiButton
                        v-if="user.disabled && user.canDisable"
                        size="sm"
                        variant="outline"
                        :disabled="busy"
                        @click="reactivateUser(user.id)"
                      >
                        {{ t("admin.reactivate") }}
                      </UiButton>
                      <UiButton
                        v-else-if="user.canDisable"
                        size="sm"
                        variant="ghost"
                        :disabled="busy"
                        @click="requestDisable(user)"
                      >
                        {{ t("admin.deactivate") }}
                      </UiButton>
                    </div>
                  </div>
                </div>
              </section>

              <section v-else-if="section === 'workspaces'" class="cx-section">
                <p class="cx-section-label">{{ t("admin.workspacesSection") }}</p>
                <p class="cx-section-note">{{ t("admin.workspacesHint") }}</p>
                <div class="cx-search mb-2">
                  <Search class="h-3 w-3 shrink-0 text-ink-400" />
                  <input
                    v-model="listQuery"
                    type="text"
                    autocomplete="off"
                    :placeholder="t('admin.searchWorkspaces')"
                    :aria-label="t('admin.searchWorkspaces')"
                  />
                </div>
                <div v-if="!workspaces.length" class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400">
                  {{ t("admin.noWorkspaces") }}
                </div>
                <div
                  v-else-if="!filteredWorkspaces.length"
                  class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400"
                >
                  {{ t("admin.noWorkspaceMatches") }}
                </div>
                <div v-else class="cx-panel">
                  <div
                    v-for="workspace in filteredWorkspaces"
                    :key="workspace.id"
                    class="cx-row cx-row-top cx-row-wrap"
                  >
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <p class="cx-row-title">{{ workspace.login }}</p>
                        <UiBadge :tone="statusTone(workspace.status)">{{ statusLabel(workspace.status) }}</UiBadge>
                      </div>
                      <p class="cx-row-desc font-mono">{{ workspace.branch }}</p>
                      <p class="cx-row-desc">
                        {{ t("admin.lastActive") }} · {{ relativeTime(workspace.lastActiveAt) }}
                        <span v-if="formatBytes(workspace.bytes)"> · {{ formatBytes(workspace.bytes) }}</span>
                        <span v-if="workspace.port"> · :{{ workspace.port }}</span>
                        <span v-if="workspace.vitePort"> · Vite :{{ workspace.vitePort }}</span>
                      </p>
                      <p class="cx-row-desc truncate font-mono" :title="workspace.worktree">
                        {{ shortWorktree(workspace.worktree) }}
                      </p>
                      <a
                        v-if="workspace.previewPath"
                        class="cx-link mt-1 inline-flex items-center gap-1"
                        :href="workspace.previewPath"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {{ workspace.previewPath }}
                        <ArrowUpRight class="h-3 w-3" />
                      </a>
                      <p v-if="workspace.lastError" class="cx-row-desc cx-tone-warn">{{ workspace.lastError }}</p>
                    </div>
                    <div class="cx-row-actions flex shrink-0 items-center justify-end gap-1.5">
                      <UiButton
                        size="sm"
                        variant="outline"
                        :disabled="busy || workspace.status === 'hibernated'"
                        @click.prevent="hibernateWorkspace(workspace.id)"
                      >
                        {{ t("admin.hibernate") }}
                      </UiButton>
                      <UiButton size="sm" variant="ghost" :disabled="busy" @click.prevent="requestDestroy(workspace)">
                        {{ t("admin.deleteWorkspace") }}
                      </UiButton>
                    </div>
                  </div>
                </div>
              </section>

              <section v-else-if="section === 'rules'" class="cx-section">
                <p class="cx-section-label">{{ t("admin.rulesSection") }}</p>
                <p class="cx-section-note">{{ t("admin.rulesHint") }}</p>
                <div class="cx-panel">
                  <div v-for="layer in rules" :key="layer.id" class="cx-row cx-row-stack">
                    <p class="cx-row-title">{{ ruleLabel(layer.level) }}</p>
                    <p class="cx-row-desc">{{ ruleHint(layer.level) }}</p>
                    <textarea
                      v-model="layer.body"
                      class="cx-textarea cx-row-control h-28"
                      :aria-label="ruleLabel(layer.level)"
                    />
                  </div>
                  <div class="admin-action-bar">
                    <UiButton size="sm" variant="outline" :disabled="busy" @click="saveRules">
                      {{ t("admin.saveRules") }}
                    </UiButton>
                  </div>
                </div>
              </section>

              <section v-else-if="section === 'flags' && overview" class="cx-section">
                <p class="cx-section-label">{{ t("flags.title") }}</p>
                <p class="cx-section-note">{{ t("admin.flagsHint") }}</p>
                <div class="cx-panel">
                  <div v-for="flag in flagList" :key="flag" class="cx-row">
                    <div class="min-w-0">
                      <p class="cx-row-title">{{ t(`flags.${flag}`) }}</p>
                      <p class="cx-row-desc">{{ t(`admin.flagHint.${flag}`) }}</p>
                    </div>
                    <UiSwitch
                      :model-value="!!overview.flags[flag]"
                      :label="t(`flags.${flag}`)"
                      @update:model-value="patchFlag(flag, $event)"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
  <UiDialog
    :open="pendingDestroy != null"
    :title="t('admin.deleteWorkspaceTitle', { login: pendingDestroy?.login ?? '' })"
    @close="cancelDestroy"
  >
    <p class="text-[13px] leading-relaxed text-ink-500">{{ t("admin.deleteWorkspaceBody") }}</p>
    <label v-if="pendingDestroy?.canDeactivate" class="mt-4 flex items-start gap-2 text-[13px] text-ink-700">
      <input v-model="alsoDeactivate" type="checkbox" class="mt-0.5" />
      <span>{{ t("admin.deleteWorkspaceAlsoDisable") }}</span>
    </label>
    <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <UiButton size="sm" variant="outline" data-autofocus @click="cancelDestroy">
        {{ t("admin.removeKeyCancel") }}
      </UiButton>
      <UiButton size="sm" variant="danger" :disabled="busy" @click="confirmDestroy">
        {{ t("admin.deleteWorkspace") }}
      </UiButton>
    </div>
  </UiDialog>
  <UiDialog
    :open="pendingDisable != null"
    :title="t('admin.deactivateTitle', { login: pendingDisable?.login ?? '' })"
    @close="cancelDisable"
  >
    <p class="text-[13px] leading-relaxed text-ink-500">{{ t("admin.deactivateBody") }}</p>
    <label v-if="pendingDisable?.hasWorkspace" class="mt-4 flex items-start gap-2 text-[13px] text-ink-700">
      <input v-model="alsoDestroy" type="checkbox" class="mt-0.5" />
      <span>{{ t("admin.deactivateAlsoDestroy") }}</span>
    </label>
    <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <UiButton size="sm" variant="outline" data-autofocus @click="cancelDisable">
        {{ t("admin.removeKeyCancel") }}
      </UiButton>
      <UiButton size="sm" variant="danger" :disabled="busy" @click="confirmDisable">
        {{ t("admin.deactivate") }}
      </UiButton>
    </div>
  </UiDialog>
</template>
