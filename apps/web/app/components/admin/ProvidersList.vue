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
        <div class="flex min-w-0 items-center gap-2.5">
          <p class="text-[13px] font-medium tracking-tight text-ink-950">{{ provider.label }}</p>
          <UiBadge :tone="provider.implemented ? 'live' : 'neutral'">
            {{ provider.implemented ? t("admin.ready") : t("admin.comingSoon") }}
          </UiBadge>
        </div>
        <UiSwitch
          :model-value="provider.enabled"
          :label="t('admin.enabled')"
          @update:model-value="emit('toggle', provider.id, $event)"
        />
      </div>
      <div v-if="provider.implemented" class="provider-key">
        <span class="w-14 shrink-0 text-[11px] tracking-tight text-ink-400">{{ t("admin.apiKey") }}</span>
        <input
          :value="keyValue(provider.id)"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :placeholder="provider.hasKey ? t('admin.hasKey') : t('admin.apiKeyPlaceholder')"
          class="provider-key-input"
          @input="setKey(provider.id, ($event.target as HTMLInputElement).value)"
        />
        <UiButton size="sm" :disabled="!canSave(provider.id)" @click="emit('save', provider.id, provider.enabled)">
          {{ t("admin.saveProvider") }}
        </UiButton>
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
  opacity: 0.58;
}

.provider-item-soon:hover,
.provider-item-soon:focus-within {
  opacity: 0.78;
}

.provider-item-ready:hover {
  background: rgba(255, 255, 255, 0.018);
}

.provider-row {
  min-height: 48px;
  padding-top: 10px;
  padding-bottom: 10px;
}

.provider-key {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 12px;
}

.provider-key-input {
  height: 32px;
  min-width: 0;
  flex: 1;
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
</style>
