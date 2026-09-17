<script setup lang="ts">
import { ChevronDown, ChevronUp, RotateCcw, Trash2 } from "@lucide/vue";

type ProviderKeyRow = {
  ref: string;
  label: string;
  enabled: boolean;
  present: boolean;
  usable: boolean;
  failures: number;
  cooldownUntil: string | null;
  lastError: string | null;
  lastFailureKind: string | null;
  lastUsedAt: string | null;
};

type ProviderModelRow = { id: string; label: string; description?: string };

type ProviderRow = {
  id: string;
  label: string;
  enabled: boolean;
  implemented: boolean;
  hasKey: boolean;
  health?: string;
  sandbox?: string;
  message?: string;
  model?: string;
  models?: ProviderModelRow[];
  keys?: ProviderKeyRow[];
};

const props = defineProps<{
  providers: ProviderRow[];
  keys: Record<string, string>;
  labels: Record<string, string>;
  models: Record<string, string>;
  busy: boolean;
}>();

const emit = defineEmits<{
  "update:keys": [value: Record<string, string>];
  "update:labels": [value: Record<string, string>];
  "update:models": [value: Record<string, string>];
  toggle: [id: string, enabled: boolean];
  save: [id: string];
  model: [id: string, model: string];
  key: [payload: { id: string; keyRef: string; keyEnabled?: boolean; moveKey?: "up" | "down"; resetKey?: boolean; deleteKey?: boolean }];
}>();

const { t } = useI18n();
const drafts = reactive<Record<string, string>>({});
const labelDrafts = reactive<Record<string, string>>({});
const modelDrafts = reactive<Record<string, string>>({});

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

watch(
  () => props.models,
  (next) => {
    for (const [id, value] of Object.entries(next)) modelDrafts[id] = value;
  },
  { deep: true, immediate: true },
);

watch(
  () => props.providers,
  (next) => {
    for (const provider of next) {
      if (modelDrafts[provider.id] == null) modelDrafts[provider.id] = provider.model ?? "";
    }
  },
  { deep: true, immediate: true },
);

function keyValue(id: string) {
  return drafts[id] ?? props.keys[id] ?? "";
}

function setKey(id: string, value: string) {
  drafts[id] = value;
  emit("update:keys", { ...props.keys, [id]: value });
}

function labelValue(id: string) {
  return labelDrafts[id] ?? props.labels[id] ?? "";
}

function setLabel(id: string, value: string) {
  labelDrafts[id] = value;
  emit("update:labels", { ...props.labels, [id]: value });
}

function modelValue(id: string) {
  return modelDrafts[id] ?? props.models[id] ?? "";
}

function setModel(id: string, value: string) {
  modelDrafts[id] = value;
  emit("update:models", { ...props.models, [id]: value });
}

function canSave(id: string) {
  return Boolean(keyValue(id).trim()) && !props.busy;
}

function keyStatus(key: ProviderKeyRow) {
  if (!key.present) return t("admin.noKey");
  if (!key.enabled) return t("admin.providerKeyDisabled");
  if (!key.usable && key.failures >= 5) return t("admin.providerKeyExhausted");
  if (!key.usable) return t("admin.providerKeyCooldown");
  return t("admin.hasKey");
}
</script>

<template>
  <div>
    <section class="cx-section">
      <p class="cx-section-label">{{ t("admin.providersSection") }}</p>
      <p class="cx-section-note">{{ t("admin.providersHint") }}</p>
      <div class="cx-panel">
        <div v-for="provider in providers" :key="provider.id" class="cx-row cx-row-wrap cx-row-top">
          <div class="min-w-0 flex-1" :class="provider.implemented ? '' : 'opacity-70'">
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
            <p v-if="provider.message" class="cx-row-desc">{{ provider.message }}</p>
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
      <p class="cx-section-label">{{ t("admin.providerModel") }}</p>
      <p class="cx-section-note">{{ t("admin.providerModelHint") }}</p>
      <div class="cx-panel">
        <div v-for="provider in keyed" :key="provider.id" class="cx-row cx-row-wrap">
          <div class="min-w-0">
            <p class="cx-row-title">{{ provider.label }}</p>
            <p class="cx-row-desc">{{ t("admin.providerModelDefault") }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <input
              :value="modelValue(provider.id)"
              :list="`provider-models-${provider.id}`"
              autocomplete="off"
              spellcheck="false"
              class="cx-field w-[190px]"
              :placeholder="t('admin.providerModelPlaceholder')"
              :aria-label="`${provider.label} · ${t('admin.providerModel')}`"
              @input="setModel(provider.id, ($event.target as HTMLInputElement).value)"
            />
            <datalist :id="`provider-models-${provider.id}`">
              <option v-for="item in provider.models ?? []" :key="item.id" :value="item.id">{{ item.label }}</option>
            </datalist>
            <UiButton size="sm" variant="outline" :disabled="busy" @click="emit('model', provider.id, modelValue(provider.id))">
              {{ t("admin.saveModel") }}
            </UiButton>
          </div>
        </div>
      </div>
    </section>

    <section v-if="keyed.length" class="cx-section">
      <p class="cx-section-label">{{ t("admin.providerKeys") }}</p>
      <p class="cx-section-note">{{ t("admin.providerKeysHint") }}</p>
      <div v-for="provider in keyed" :key="provider.id" class="cx-panel mb-3 last:mb-0">
        <div class="cx-row">
          <div class="min-w-0">
            <p class="cx-row-title">{{ provider.label }}</p>
            <p class="cx-row-desc">
              {{
                t("admin.providerKeysReady", {
                  ready: (provider.keys ?? []).filter((key) => key.usable && key.present).length,
                  total: (provider.keys ?? []).length,
                })
              }}
            </p>
          </div>
        </div>
        <div v-for="(key, index) in provider.keys ?? []" :key="key.ref" class="cx-row cx-row-wrap">
          <div class="min-w-0">
            <p class="cx-row-title">{{ key.label || key.ref }}</p>
            <p class="cx-row-desc">
              <span class="font-mono">{{ key.ref }}</span>
              · {{ keyStatus(key) }}
            </p>
            <p v-if="key.lastError" class="cx-row-desc">{{ key.lastError }}</p>
          </div>
          <div class="cx-row-actions flex shrink-0 items-center gap-1">
            <UiSwitch
              :model-value="key.enabled"
              :label="`${key.ref} · ${t('admin.enabled')}`"
              @update:model-value="emit('key', { id: provider.id, keyRef: key.ref, keyEnabled: $event })"
            />
            <UiIconButton
              size="sm"
              :label="t('admin.moveKeyUp')"
              :disabled="busy || index === 0"
              @click="emit('key', { id: provider.id, keyRef: key.ref, moveKey: 'up' })"
            >
              <ChevronUp class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.moveKeyDown')"
              :disabled="busy || index === (provider.keys?.length ?? 0) - 1"
              @click="emit('key', { id: provider.id, keyRef: key.ref, moveKey: 'down' })"
            >
              <ChevronDown class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.resetKey')"
              :disabled="busy || (!key.failures && !key.cooldownUntil)"
              @click="emit('key', { id: provider.id, keyRef: key.ref, resetKey: true })"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.deleteProviderKey')"
              :disabled="busy"
              @click="emit('key', { id: provider.id, keyRef: key.ref, deleteKey: true })"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </UiIconButton>
          </div>
        </div>
        <div class="cx-row cx-row-wrap">
          <div class="min-w-0">
            <p class="cx-row-title">{{ t("admin.addKey") }}</p>
            <p class="cx-row-desc">{{ t("admin.apiKeyPlaceholder") }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <input
              :value="labelValue(provider.id)"
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="cx-field w-[120px]"
              :placeholder="t('admin.providerKeyLabelPlaceholder')"
              :aria-label="`${provider.label} · ${t('admin.providerKeyLabel')}`"
              @input="setLabel(provider.id, ($event.target as HTMLInputElement).value)"
            />
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
            <UiButton size="sm" variant="outline" :disabled="!canSave(provider.id)" @click="emit('save', provider.id)">
              {{ t("admin.saveProvider") }}
            </UiButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
