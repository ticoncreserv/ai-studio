<script setup lang="ts">
import type { UsageProfile, UsageSummary } from "@atelier/contracts";
import { formatTokens, usageBarTone, usageBarWidth } from "~/utils/usage";

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
}>();

const { t, locale } = useI18n();
const relativeTime = useRelativeTime();
const tokens = (value: number) => formatTokens(value, locale.value);

const drafts = ref<UsageProfile[]>(clone(props.profiles));
const grantDraft = reactive<Record<string, string>>({});

watch(
  () => props.profiles,
  (next) => {
    drafts.value = clone(next);
  },
  { deep: true },
);

function clone(profiles: UsageProfile[]): UsageProfile[] {
  return profiles.map((profile) => ({ ...profile, limits: { ...profile.limits }, providers: [...profile.providers] }));
}

const limitFields = [
  "monthlyTokens",
  "dailyTokens",
  "perRunTokens",
  "perRunToolCalls",
] as const;

const dirty = computed(() => JSON.stringify(drafts.value) !== JSON.stringify(props.profiles));

const assignedCount = computed(() => {
  const counts: Record<string, number> = {};
  for (const row of props.users) counts[row.profileId] = (counts[row.profileId] ?? 0) + 1;
  return counts;
});

function setLimit(profileId: string, field: (typeof limitFields)[number], raw: string) {
  const profile = drafts.value.find((row) => row.id === profileId);
  if (!profile) return;
  const value = Number(raw.replace(/\D/g, ""));
  profile.limits[field] = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function setCost(profileId: string, raw: string) {
  const profile = drafts.value.find((row) => row.id === profileId);
  if (!profile) return;
  const value = Number(raw.replace(",", "."));
  profile.limits.monthlyCostUsd = Number.isFinite(value) && value > 0 ? value : 0;
}

function submitGrant(userId: string) {
  const tokens = Number((grantDraft[userId] ?? "").replace(/\D/g, ""));
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  emit("grant", userId, tokens, t("admin.usageGrantReason"));
  grantDraft[userId] = "";
}
</script>

<template>
  <div>
    <section class="cx-section">
      <p class="cx-section-label">{{ t("admin.usageProfilesSection") }}</p>
      <p class="cx-section-note">{{ t("admin.usageProfilesHint") }}</p>
      <p v-if="!props.limitsOn" class="cx-section-note text-amber-600">{{ t("admin.usageLimitsOff") }}</p>
      <div class="cx-panel">
        <div v-for="profile in drafts" :key="profile.id" class="border-b border-ink-100 p-3 last:border-b-0">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="cx-row-title">{{ profile.label }}</p>
              <p class="cx-row-desc">
                <span class="font-mono">{{ profile.id }}</span>
                · {{ t("admin.usageAssigned", { count: assignedCount[profile.id] ?? 0 }) }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <label class="cx-value" :for="`enforcement-${profile.id}`">{{ t("admin.usageEnforcement") }}</label>
              <select :id="`enforcement-${profile.id}`" v-model="profile.enforcement" class="cx-field w-[110px]">
                <option value="block">{{ t("admin.usageEnforcementBlock") }}</option>
                <option value="warn">{{ t("admin.usageEnforcementWarn") }}</option>
              </select>
              <label class="cx-value" :for="`meter-${profile.id}`">{{ t("admin.usageMeterLabel") }}</label>
              <select :id="`meter-${profile.id}`" v-model="profile.meter" class="cx-field w-[130px]">
                <option value="max">{{ t("admin.usageMeter.max") }}</option>
                <option value="estimated">{{ t("admin.usageMeter.estimated") }}</option>
                <option value="context_peak">{{ t("admin.usageMeter.context_peak") }}</option>
              </select>
            </div>
          </div>
          <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="field in limitFields" :key="field">
              <label class="cx-value" :for="`${field}-${profile.id}`">{{ t(`admin.usageLimit.${field}`) }}</label>
              <input
                :id="`${field}-${profile.id}`"
                :value="profile.limits[field]"
                inputmode="numeric"
                class="cx-field w-full"
                @input="setLimit(profile.id, field, ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div>
              <label class="cx-value" :for="`cost-${profile.id}`">{{ t("admin.usageLimit.monthlyCostUsd") }}</label>
              <input
                :id="`cost-${profile.id}`"
                :value="profile.limits.monthlyCostUsd"
                inputmode="decimal"
                class="cx-field w-full"
                @input="setCost(profile.id, ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div>
              <label class="cx-value" :for="`warn-${profile.id}`">{{ t("admin.usageWarnAt") }}</label>
              <input
                :id="`warn-${profile.id}`"
                v-model.number="profile.warnAtPercent"
                type="number"
                min="1"
                max="100"
                class="cx-field w-full"
              />
            </div>
          </div>
          <p class="cx-row-desc mt-1.5">{{ t("admin.usageZeroHint") }}</p>
        </div>
      </div>
      <div class="mt-2 flex justify-end">
        <UiButton size="sm" :disabled="props.busy || !dirty" @click="emit('save', drafts)">
          {{ t("admin.usageSaveProfiles") }}
        </UiButton>
      </div>
    </section>

    <section class="cx-section">
      <p class="cx-section-label">{{ t("admin.usageUsersSection") }}</p>
      <p class="cx-section-note">{{ t("admin.usageUsersHint") }}</p>
      <div class="cx-panel">
        <div v-for="row in props.users" :key="row.userId" class="cx-row">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <p class="cx-row-title">{{ row.login }}</p>
              <UiBadge v-if="row.decision.decision !== 'allow'">
                {{ t(`admin.usageState.${row.decision.decision}`) }}
              </UiBadge>
            </div>
            <p class="cx-row-desc">
              <span v-if="row.unlimited">{{ t("admin.usageUnlimited", { used: tokens(row.periodTokens) }) }}</span>
              <span v-else>{{ t("admin.usageOfLimit", { used: tokens(row.periodTokens), limit: tokens(row.limitTokens) }) }}</span>
              <span v-if="row.periodCostUsd > 0"> · {{ t("admin.usageCost", { cost: row.periodCostUsd }) }}</span>
              <span v-if="row.grantedTokens > 0"> · {{ t("admin.usageGranted", { tokens: tokens(row.grantedTokens) }) }}</span>
              <span v-if="row.lastRunAt"> · {{ relativeTime(row.lastRunAt) }}</span>
            </p>
            <div class="mt-1.5 h-1 w-full max-w-[260px] overflow-hidden rounded-full bg-ink-100">
              <div class="h-full" :class="usageBarTone(row.decision.decision)" :style="{ width: usageBarWidth(row) }" />
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <select
              :value="row.profileId"
              class="cx-field w-[120px]"
              :aria-label="t('admin.usageProfile')"
              @change="emit('assign', row.userId, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="profile in props.profiles" :key="profile.id" :value="profile.id">{{ profile.label }}</option>
            </select>
            <input
              v-model="grantDraft[row.userId]"
              inputmode="numeric"
              class="cx-field w-[110px]"
              :placeholder="t('admin.usageGrantPlaceholder')"
              :aria-label="t('admin.usageGrant')"
            />
            <UiButton size="sm" variant="outline" :disabled="props.busy" @click="submitGrant(row.userId)">
              {{ t("admin.usageGrant") }}
            </UiButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
