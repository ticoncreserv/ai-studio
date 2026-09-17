<script setup lang="ts">
import { ChevronRight, Plus, Search, Trash2 } from "@lucide/vue";
import type { UsageProfile, UsageSummary } from "@atelier/contracts";
import { createUsageProfile } from "@atelier/domain";
import { formatTokenCompact, formatTokens, usageBarTone, usageBarWidth } from "~/utils/usage";

type UsageRow = UsageSummary & { login: string; name: string };

const props = defineProps<{
  profiles: UsageProfile[];
  users: UsageRow[];
  busy: boolean;
  limitsOn: boolean;
}>();

const emit = defineEmits<{
  save: [profiles: UsageProfile[]];
  assign: [userId: string, profileId: string];
  grant: [userId: string, tokens: number, reason: string];
  delete: [profileId: string, migrateTo?: string];
}>();

const { t, locale } = useI18n();
const relativeTime = useRelativeTime();
const tokens = (value: number) => formatTokens(value, locale.value);
const compact = (value: number) => formatTokenCompact(value, locale.value);

const drafts = ref<UsageProfile[]>(clone(props.profiles));
const grantDraft = reactive<Record<string, string>>({});
const peopleOpen = reactive<Record<string, boolean>>({});
const peopleQuery = ref("");
const pendingDelete = ref<{ id: string; label: string; logins: string[]; migrateTo: string } | null>(null);

watch(
  () => props.profiles,
  (next, prev) => {
    const dirtyById = new Map(
      drafts.value.filter((row) => isDirty(row)).map((row) => [row.id, row] as const),
    );
    const incoming = next.map((profile) => dirtyById.get(profile.id) ?? cloneOne(profile));
    const previous = prev ?? [];
    const unsaved = drafts.value.filter(
      (row) => !next.some((profile) => profile.id === row.id) && !previous.some((profile) => profile.id === row.id),
    );
    drafts.value = [...incoming, ...unsaved];
  },
  { deep: true },
);

function cloneOne(profile: UsageProfile): UsageProfile {
  return { ...profile, limits: { ...profile.limits }, providers: [...profile.providers] };
}

function clone(profiles: UsageProfile[]): UsageProfile[] {
  return profiles.map(cloneOne);
}

function persisted(profile: UsageProfile) {
  return props.profiles.some((row) => row.id === profile.id);
}

function sourceOf(profile: UsageProfile) {
  return props.profiles.find((row) => row.id === profile.id) ?? null;
}

function isDirty(profile: UsageProfile) {
  const source = sourceOf(profile);
  if (!source) return true;
  return JSON.stringify(profile) !== JSON.stringify(source);
}

const limitFields = ["dailyTokens", "perRunTokens", "perRunToolCalls"] as const;

const dirty = computed(() => drafts.value.some(isDirty));

const planOptions = computed(() => drafts.value.map((row) => ({ id: row.id, label: row.label || row.id })));

const assignedCount = computed(() => {
  const counts: Record<string, number> = {};
  for (const row of props.users) counts[row.profileId] = (counts[row.profileId] ?? 0) + 1;
  return counts;
});

const sortedDrafts = computed(() =>
  [...drafts.value].sort((a, b) => {
    const diff = a.limits.monthlyTokens - b.limits.monthlyTokens;
    if (diff) return diff;
    return a.label.localeCompare(b.label);
  }),
);

function peopleOn(profileId: string) {
  const needle = fold(peopleQuery.value.trim());
  return props.users
    .filter((row) => row.profileId === profileId)
    .filter((row) => {
      if (!needle) return true;
      return fold(`${row.login} ${row.name}`).includes(needle);
    })
    .sort((a, b) => a.login.localeCompare(b.login));
}

function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function peopleExpanded(profileId: string) {
  if (peopleOpen[profileId] != null) return peopleOpen[profileId];
  return Boolean(peopleQuery.value.trim()) && peopleOn(profileId).length > 0;
}

function togglePeople(profileId: string) {
  peopleOpen[profileId] = !peopleExpanded(profileId);
}

function peopleCountLabel(count: number) {
  return t("admin.usagePeopleCount", count, { count });
}

function setLimit(profile: UsageProfile, field: keyof UsageProfile["limits"], raw: string) {
  const numeric = field === "monthlyCostUsd" ? Number(raw.replace(",", ".")) : Number(raw.replace(/\D/g, ""));
  profile.limits[field] = Number.isFinite(numeric) && numeric > 0 ? (field === "monthlyCostUsd" ? numeric : Math.trunc(numeric)) : 0;
}

function addPlan() {
  drafts.value = [...drafts.value, createUsageProfile(t("admin.usageNewPlan"), drafts.value)];
}

function requestDelete(profile: UsageProfile) {
  if (drafts.value.length <= 1) return;
  if (!persisted(profile)) {
    drafts.value = drafts.value.filter((row) => row.id !== profile.id);
    return;
  }
  const logins = props.users.filter((row) => row.profileId === profile.id).map((row) => row.login);
  const fallback = drafts.value.find((row) => row.id !== profile.id && persisted(row)) ?? drafts.value.find((row) => row.id !== profile.id);
  pendingDelete.value = {
    id: profile.id,
    label: profile.label,
    logins,
    migrateTo: fallback?.id ?? "",
  };
}

function confirmDelete() {
  const pending = pendingDelete.value;
  if (!pending) return;
  emit("delete", pending.id, pending.logins.length ? pending.migrateTo : undefined);
  pendingDelete.value = null;
}

function submitGrant(userId: string) {
  const amount = Number((grantDraft[userId] ?? "").replace(/\D/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return;
  emit("grant", userId, amount, t("admin.usageGrantReason"));
  grantDraft[userId] = "";
}

function migrateOptions(exceptId: string) {
  return drafts.value.filter((row) => row.id !== exceptId && persisted(row));
}

function savePlans() {
  emit(
    "save",
    drafts.value.map((profile) => ({
      ...profile,
      label: profile.label.trim() || profile.id,
      warnAtPercent: Math.min(100, Math.max(1, Math.trunc(Number(profile.warnAtPercent) || 80))),
      limits: { ...profile.limits },
      providers: [...profile.providers],
    })),
  );
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section class="cx-section !mt-0">
      <p class="cx-section-label">{{ t("admin.usageProfilesSection") }}</p>
      <p class="cx-section-note">{{ t("admin.usageProfilesHint") }}</p>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <UiButton size="sm" variant="outline" :disabled="props.busy" @click="addPlan">
          <Plus class="h-3.5 w-3.5" />
          {{ t("admin.usageNewPlan") }}
        </UiButton>
        <UiButton size="sm" :disabled="props.busy || !dirty" @click="savePlans">
          {{ t("admin.usageSaveProfiles") }}
        </UiButton>
      </div>
      <p v-if="!props.limitsOn" class="cx-section-note mt-2 text-amber-200/90">{{ t("admin.usageLimitsOff") }}</p>
    </section>

    <div class="cx-search">
      <Search class="h-3 w-3 shrink-0 text-ink-400" />
      <input
        v-model="peopleQuery"
        type="text"
        autocomplete="off"
        :placeholder="t('admin.usageSearchPeople')"
        :aria-label="t('admin.usageSearchPeople')"
      />
    </div>

    <article
      v-for="profile in sortedDrafts"
      :key="profile.id"
      class="cx-panel admin-plan"
      :class="isDirty(profile) ? 'ring-1 ring-inset ring-coral-500/25' : ''"
    >
      <header class="px-4 pt-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <label class="sr-only" :for="`label-${profile.id}`">{{ t("admin.usagePlanName") }}</label>
            <input
              :id="`label-${profile.id}`"
              v-model="profile.label"
              class="h-8 w-full max-w-[280px] border-0 border-b border-transparent bg-transparent px-0 text-[15px] font-medium text-ink-950 outline-none focus:border-coral-500/55"
              :placeholder="t('admin.usagePlanName')"
            />
            <p class="cx-row-desc font-mono text-[11px] text-ink-400">{{ profile.id }}</p>
          </div>
          <UiButton
            size="sm"
            variant="ghost"
            :disabled="props.busy || drafts.length <= 1"
            :aria-label="t('admin.usageDeletePlan')"
            @click="requestDelete(profile)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </UiButton>
        </div>
        <div class="admin-plan-policy">
          <select
            v-model="profile.enforcement"
            class="cx-field w-[118px]"
            :aria-label="t('admin.usageEnforcement')"
          >
            <option value="block">{{ t("admin.usageEnforcementBlock") }}</option>
            <option value="warn">{{ t("admin.usageEnforcementWarn") }}</option>
          </select>
          <select v-model="profile.meter" class="cx-field w-[148px]" :aria-label="t('admin.usageMeterLabel')">
            <option value="max">{{ t("admin.usageMeter.max") }}</option>
            <option value="estimated">{{ t("admin.usageMeter.estimated") }}</option>
            <option value="context_peak">{{ t("admin.usageMeter.context_peak") }}</option>
          </select>
          <label class="admin-plan-warn" :for="`warn-${profile.id}`">
            <span class="sr-only">{{ t("admin.usageWarnAt") }}</span>
            <input
              :id="`warn-${profile.id}`"
              v-model.number="profile.warnAtPercent"
              type="number"
              min="1"
              max="100"
              :aria-label="t('admin.usageWarnAt')"
            />
            <span aria-hidden="true">%</span>
          </label>
        </div>
      </header>

      <div class="px-4 pt-4 pb-3">
        <p class="text-[11px] tracking-[0.04em] text-ink-400 uppercase">{{ t("admin.usageLimit.monthlyTokens") }}</p>
        <input
          :value="tokens(profile.limits.monthlyTokens)"
          inputmode="numeric"
          class="cx-usage-ledger"
          :aria-label="t('admin.usageLimit.monthlyTokens')"
          @input="setLimit(profile, 'monthlyTokens', ($event.target as HTMLInputElement).value)"
        />
        <p class="cx-row-desc mt-2">
          <template v-if="profile.limits.monthlyTokens > 0">
            {{
              t("admin.usageLedgerHint", {
                daily: compact(profile.limits.dailyTokens),
                run: compact(profile.limits.perRunTokens),
                tools:
                  profile.limits.perRunToolCalls > 0
                    ? t("admin.usageLedgerTools", { count: profile.limits.perRunToolCalls })
                    : t("admin.usageNoToolCap"),
              })
            }}
          </template>
          <template v-else>{{ t("admin.usageNoMonthlyCap") }}</template>
        </p>
      </div>

      <div class="cx-usage-spec">
        <div v-for="field in limitFields" :key="field" class="cx-usage-spec-cell">
          <label :for="`${field}-${profile.id}`">{{ t(`admin.usageLimitShort.${field}`) }}</label>
          <input
            :id="`${field}-${profile.id}`"
            :value="tokens(profile.limits[field])"
            inputmode="numeric"
            class="cx-field w-full"
            :aria-label="t(`admin.usageLimit.${field}`)"
            @input="setLimit(profile, field, ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="cx-usage-spec-cell">
          <label :for="`cost-${profile.id}`">{{ t("admin.usageLimitShort.monthlyCostUsd") }}</label>
          <input
            :id="`cost-${profile.id}`"
            :value="profile.limits.monthlyCostUsd"
            inputmode="decimal"
            class="cx-field w-full"
            :aria-label="t('admin.usageLimit.monthlyCostUsd')"
            @input="setLimit(profile, 'monthlyCostUsd', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
      <p class="px-4 py-2.5 text-[11px] text-ink-400">{{ t("admin.usageZeroHintShort") }}</p>

      <div class="admin-plan-drawer">
        <button
          type="button"
          class="admin-plan-drawer-toggle"
          :aria-expanded="peopleExpanded(profile.id)"
          :aria-controls="`people-${profile.id}`"
          :aria-label="t('admin.usagePeople')"
          @click="togglePeople(profile.id)"
        >
          <span class="admin-plan-drawer-chevron" :class="peopleExpanded(profile.id) && 'is-open'" aria-hidden="true">
            <ChevronRight />
          </span>
          <span class="admin-plan-drawer-count">{{ peopleCountLabel(assignedCount[profile.id] ?? 0) }}</span>
        </button>
        <div v-show="peopleExpanded(profile.id)" :id="`people-${profile.id}`" class="admin-plan-people">
          <div v-if="!peopleOn(profile.id).length" class="px-4 py-5 text-[13px] text-ink-400">
            {{ peopleQuery.trim() ? t("admin.usageNoPeopleMatch") : t("admin.usageNoPeople") }}
          </div>
          <article v-for="row in peopleOn(profile.id)" :key="row.userId" class="admin-plan-person">
            <div class="admin-plan-identity">
              <span class="admin-plan-photo" aria-hidden="true">
                <UiAvatar :name="row.login" size="sm" />
              </span>
              <div class="min-w-0">
                <div class="admin-plan-head">
                  <p class="admin-plan-login">{{ row.login }}</p>
                  <UiBadge v-if="row.decision.decision !== 'allow'" tone="warn">
                    {{ t(`admin.usageState.${row.decision.decision}`) }}
                  </UiBadge>
                </div>
                <p class="admin-plan-facts">
                  <span v-if="row.unlimited">{{ t("admin.usageUnlimited", { used: tokens(row.periodTokens) }) }}</span>
                  <span v-else>{{ t("admin.usageOfLimit", { used: tokens(row.periodTokens), limit: tokens(row.limitTokens) }) }}</span>
                  <span v-if="row.periodCostUsd > 0">{{ t("admin.usageCost", { cost: row.periodCostUsd }) }}</span>
                  <span v-if="row.grantedTokens > 0">{{ t("admin.usageGranted", { tokens: tokens(row.grantedTokens) }) }}</span>
                  <span v-if="row.lastRunAt">{{ relativeTime(row.lastRunAt) }}</span>
                </p>
                <div v-if="!row.unlimited" class="admin-plan-meter" aria-hidden="true">
                  <div class="admin-plan-meter-track">
                    <div :class="usageBarTone(row.decision.decision)" :style="{ width: usageBarWidth(row) }" />
                  </div>
                </div>
              </div>
            </div>
            <div class="admin-plan-cluster">
              <UiSelect
                :model-value="row.profileId"
                :options="planOptions"
                :allow-empty="false"
                :disabled="props.busy"
                :aria-label="`${row.login} · ${t('admin.usageProfile')}`"
                @update:model-value="emit('assign', row.userId, $event)"
              />
              <input
                v-model="grantDraft[row.userId]"
                inputmode="numeric"
                class="cx-field"
                :placeholder="t('admin.usageGrantPlaceholder')"
                :aria-label="t('admin.usageGrant')"
              />
              <UiButton size="sm" variant="outline" :disabled="props.busy" @click="submitGrant(row.userId)">
                {{ t("admin.usageGrant") }}
              </UiButton>
            </div>
          </article>
        </div>
      </div>
    </article>
  </div>

  <UiDialog
    :open="pendingDelete != null"
    :title="t('admin.usageDeletePlanTitle', { label: pendingDelete?.label ?? '' })"
    @close="pendingDelete = null"
  >
    <p v-if="pendingDelete?.logins.length" class="text-[13px] leading-relaxed text-ink-500">
      {{ t("admin.usageDeletePlanBody", { count: pendingDelete.logins.length }) }}
    </p>
    <p v-else class="text-[13px] leading-relaxed text-ink-500">{{ t("admin.usageDeletePlanEmpty") }}</p>
    <p v-if="pendingDelete?.logins.length" class="mt-2 font-mono text-[12px] text-ink-600">
      {{ pendingDelete.logins.join(", ") }}
    </p>
    <label v-if="pendingDelete?.logins.length" class="mt-4 block text-[12px] text-ink-400" for="usage-migrate-to">
      {{ t("admin.usageMigrateTo") }}
    </label>
    <select
      v-if="pendingDelete?.logins.length"
      id="usage-migrate-to"
      v-model="pendingDelete.migrateTo"
      class="cx-field mt-1.5 w-full"
    >
      <option v-for="option in migrateOptions(pendingDelete.id)" :key="option.id" :value="option.id">
        {{ option.label }}
      </option>
    </select>
    <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <UiButton size="sm" variant="outline" data-autofocus @click="pendingDelete = null">
        {{ t("admin.removeKeyCancel") }}
      </UiButton>
      <UiButton
        size="sm"
        variant="danger"
        :disabled="props.busy || (Boolean(pendingDelete?.logins.length) && !pendingDelete?.migrateTo)"
        @click="confirmDelete"
      >
        {{ t("admin.usageDeletePlan") }}
      </UiButton>
    </div>
  </UiDialog>
</template>
