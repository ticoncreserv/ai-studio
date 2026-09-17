<script setup lang="ts">
import type { UsageProfile } from "@atelier/contracts";
import { Search } from "@lucide/vue";

export type AdminUserRow = {
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
  usageProfileId: string;
  usageProfileLabel: string;
  workspaceId: string | null;
  workspaceStatus: string | null;
  lastActiveAt: string | null;
};

const props = defineProps<{
  users: AdminUserRow[];
  total: number;
  query: string;
  profiles: UsageProfile[];
  busy: boolean;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  assign: [userId: string, profileId: string];
  "toggle-admin": [userId: string, next: boolean];
  reactivate: [userId: string];
  disable: [user: AdminUserRow];
}>();

const { t, te } = useI18n();

const profileOptions = computed(() => props.profiles.map((profile) => ({ id: profile.id, label: profile.label })));

function githubRoleLabel(role: string) {
  const key = `admin.githubRole.${role}`;
  return te(key) ? t(key) : role;
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

function studioFact(user: AdminUserRow) {
  if (user.workspaceStatus) return statusLabel(user.workspaceStatus);
  if (user.disabled) return "";
  return t("admin.noWorkspace");
}

function studioTone(status: string | null) {
  if (status === "running") return "ok";
  if (status === "error" || status === "hibernated") return "warn";
  return "";
}

function lockLabel(user: AdminUserRow) {
  if (user.repoOwner) return t("admin.ownerLocked");
  if (user.envAdmin) return t("admin.envLocked");
  return "";
}

function userInitial(login: string) {
  return (login || "?").slice(0, 1).toUpperCase();
}
</script>

<template>
  <section class="cx-section">
    <p class="cx-section-label">{{ t("admin.usersSection") }}</p>
    <p class="cx-section-note">{{ t("admin.usersHint") }}</p>
    <div class="cx-search mb-2">
      <Search class="h-3 w-3 shrink-0 text-ink-400" />
      <input
        :value="query"
        type="text"
        autocomplete="off"
        :placeholder="t('admin.searchUsers')"
        :aria-label="t('admin.searchUsers')"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div v-if="!total" class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400">
      {{ t("admin.noUsers") }}
    </div>
    <div v-else-if="!users.length" class="cx-panel px-4 py-7 text-center text-[13px] text-ink-400">
      {{ t("admin.noUserMatches") }}
    </div>
    <div v-else class="cx-panel admin-user-list">
      <article
        v-for="user in users"
        :key="user.id"
        class="admin-user-card"
        :data-disabled="user.disabled || undefined"
      >
        <div class="admin-user-identity">
          <span class="admin-user-photo" aria-hidden="true">{{ userInitial(user.login) }}</span>
          <div class="min-w-0">
            <div class="admin-user-head">
              <p class="admin-user-login">{{ user.login }}</p>
              <div class="admin-user-chips">
                <UiBadge v-if="user.platformAdmin" tone="info">{{ t("admin.adminBadge") }}</UiBadge>
                <UiBadge v-if="user.accessPending" tone="warn">{{ t("admin.pending") }}</UiBadge>
                <UiBadge v-if="user.disabled" tone="warn">{{ t("admin.disabledBadge") }}</UiBadge>
              </div>
            </div>
            <dl class="admin-user-facts">
              <div>
                <dt>{{ t("admin.factGithub") }}</dt>
                <dd>{{ githubRoleLabel(user.role) }}</dd>
              </div>
              <div v-if="studioFact(user)">
                <dt>{{ t("admin.factStudio") }}</dt>
                <dd :data-tone="studioTone(user.workspaceStatus) || undefined">{{ studioFact(user) }}</dd>
              </div>
            </dl>
            <p v-if="lockLabel(user)" class="admin-user-lock">{{ lockLabel(user) }}</p>
          </div>
        </div>
        <div class="admin-user-cluster">
          <UiSelect
            v-if="profiles.length"
            :model-value="user.usageProfileId"
            :options="profileOptions"
            :allow-empty="false"
            :disabled="busy"
            :aria-label="`${user.login} · ${t('admin.usageProfile')}`"
            @update:model-value="emit('assign', user.id, $event)"
          />
          <UiButton
            v-if="!lockLabel(user)"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="emit('toggle-admin', user.id, !user.platformAdmin)"
          >
            {{ user.platformAdmin ? t("admin.revokeAdmin") : t("admin.makeAdmin") }}
          </UiButton>
          <UiButton
            v-if="user.disabled && user.canDisable"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="emit('reactivate', user.id)"
          >
            {{ t("admin.reactivate") }}
          </UiButton>
          <UiButton
            v-else-if="user.canDisable"
            size="sm"
            variant="ghost"
            :disabled="busy"
            @click="emit('disable', user)"
          >
            {{ t("admin.deactivate") }}
          </UiButton>
        </div>
      </article>
    </div>
  </section>
</template>
