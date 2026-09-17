<script setup lang="ts">
type ProviderRow = {
  id: string;
  label: string;
  enabled: boolean;
  implemented: boolean;
  hasKey: boolean;
  health?: "unconfigured" | "unavailable" | "available" | "degraded" | "disabled";
  sandbox?: string;
  message?: string;
};

const props = defineProps<{
  providers: ProviderRow[];
  keys: Record<string, string>;
  busy: boolean;
}>();

const emit = defineEmits<{
  "update:keys": [value: Record<string, string>];
  toggle: [id: string, enabled: boolean];
  save: [id: string, enabled: boolean];
}>();

const { t } = useI18n();
const drafts = reactive<Record<string, string>>({});

const keyed = computed(() => props.providers.filter((provider) => provider.implemented));

watch(
  () => props.keys,
  (next) => {
    for (const [id, value] of Object.entries(next)) {
      if (!value) delete drafts[id];
    }
  },
  { deep: true },
);

function keyValue(id: string) {
  return drafts[id] ?? props.keys[id] ?? "";
}

function setKey(id: string, value: string) {
  drafts[id] = value;
  emit("update:keys", { ...props.keys, [id]: value });
}

function canSave(id: string) {
  return Boolean(keyValue(id).trim()) && !props.busy;
}
</script>

<template>
  <div>
    <section class="cx-section">
      <p class="cx-section-label">{{ t("admin.providersSection") }}</p>
      <p class="cx-section-note">{{ t("admin.providersHint") }}</p>
      <div class="cx-panel">
        <div v-for="provider in providers" :key="provider.id" class="cx-row">
          <div class="min-w-0" :class="provider.implemented ? '' : 'opacity-70'">
            <div class="flex flex-wrap items-center gap-1.5">
              <p class="cx-row-title">{{ provider.label }}</p>
              <UiBadge v-if="!provider.implemented">{{ t("admin.comingSoon") }}</UiBadge>
              <UiBadge v-else-if="provider.health">{{ t(`admin.providerHealth.${provider.health}`) }}</UiBadge>
            </div>
            <p class="cx-row-desc">
              <span class="font-mono">{{ provider.id }}</span>
              <span v-if="provider.implemented"> · {{ provider.hasKey ? t("admin.hasKey") : t("admin.noKey") }}</span>
              <span v-else> · {{ t("admin.providerSoonHint") }}</span>
            </p>
          </div>
          <UiSwitch
            :model-value="provider.enabled"
            :label="`${provider.label} · ${t('admin.enabled')}`"
            @update:model-value="emit('toggle', provider.id, $event)"
          />
        </div>
      </div>
    </section>

    <section v-if="keyed.length" class="cx-section">
      <p class="cx-section-label">{{ t("admin.providerKeys") }}</p>
      <p class="cx-section-note">{{ t("admin.providerKeysHint") }}</p>
      <div class="cx-panel">
        <div v-for="provider in keyed" :key="provider.id" class="cx-row">
          <div class="min-w-0">
            <p class="cx-row-title">{{ provider.label }}</p>
            <p class="cx-row-desc">{{ provider.hasKey ? t("admin.hasKey") : t("admin.noKey") }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <input
              :value="keyValue(provider.id)"
              type="password"
              autocomplete="off"
              spellcheck="false"
              class="cx-field w-[170px]"
              :placeholder="t('admin.apiKeyPlaceholder')"
              :aria-label="`${provider.label} · ${t('admin.apiKey')}`"
              @input="setKey(provider.id, ($event.target as HTMLInputElement).value)"
            />
            <UiButton
              size="sm"
              variant="outline"
              :disabled="!canSave(provider.id)"
              @click="emit('save', provider.id, provider.enabled)"
            >
              {{ t("admin.saveProvider") }}
            </UiButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
