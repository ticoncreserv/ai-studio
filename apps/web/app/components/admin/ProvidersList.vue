<script setup lang="ts">
type ProviderRow = {
  id: string;
  label: string;
  enabled: boolean;
  implemented: boolean;
  hasKey: boolean;
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

function keyValue(id: string) {
  return props.keys[id] ?? "";
}

function setKey(id: string, value: string) {
  emit("update:keys", { ...props.keys, [id]: value });
}

function canSave(id: string) {
  return Boolean(keyValue(id).trim()) && !props.busy;
}
</script>

<template>
  <div class="admin-panel">
    <div
      v-for="provider in providers"
      :key="provider.id"
      class="provider-item"
      :class="provider.implemented ? 'provider-item-ready' : 'provider-item-soon'"
    >
      <div class="admin-row provider-row">
        <div class="flex min-w-0 items-center gap-2.5" :class="{ 'opacity-60': !provider.implemented }">
          <div class="min-w-0">
            <p class="text-[13px] font-medium tracking-tight text-ink-950">{{ provider.label }}</p>
            <p class="font-mono text-[10px] tracking-tight text-ink-300">{{ provider.id }}</p>
          </div>
          <UiBadge :tone="provider.implemented ? 'live' : 'neutral'">
            {{ provider.implemented ? t("admin.ready") : t("admin.comingSoon") }}
          </UiBadge>
        </div>
        <div class="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <div v-if="provider.implemented" class="provider-key">
            <input
              :value="keyValue(provider.id)"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :aria-label="t('admin.apiKey')"
              :placeholder="provider.hasKey ? t('admin.hasKey') : t('admin.apiKeyPlaceholder')"
              class="provider-key-input"
              @input="setKey(provider.id, ($event.target as HTMLInputElement).value)"
            />
            <UiButton size="sm" :disabled="!canSave(provider.id)" @click="emit('save', provider.id, provider.enabled)">
              {{ t("admin.saveProvider") }}
            </UiButton>
          </div>
          <UiSwitch
            :model-value="provider.enabled"
            :label="t('admin.enabled')"
            @update:model-value="emit('toggle', provider.id, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.provider-item .admin-row {
  border-bottom: 0;
}

.provider-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.provider-item:last-child {
  border-bottom: 0;
}

.provider-item-soon {
  background: transparent;
}

.provider-item-ready:hover,
.provider-item-soon:hover {
  background: rgba(255, 255, 255, 0.018);
}

.provider-row {
  min-height: 52px;
  padding-top: 10px;
  padding-bottom: 10px;
}

.provider-key {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-key-input {
  width: min(220px, 36vw);
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.22);
  padding: 0 10px;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 12px;
  color: #d5dbe8;
  outline: none;
}

.provider-key-input::placeholder {
  color: #5c6578;
}

.provider-key-input:focus {
  border-color: rgba(110, 168, 255, 0.4);
}

@media (max-width: 639px) {
  .provider-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .provider-key-input {
    width: 100%;
  }
}
</style>
