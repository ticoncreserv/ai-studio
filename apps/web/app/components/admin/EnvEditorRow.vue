<script setup lang="ts">
import { Eye, EyeOff, Trash2 } from "@lucide/vue";
import { isSecretEnvKey, visibleEnvValue } from "~/utils/env-mask";

const props = defineProps<{
  row: { key: string; value: string };
  secret?: string;
}>();

const emit = defineEmits<{
  remove: [];
}>();

const { t } = useI18n();
const revealed = ref(false);
const secretRow = computed(() => isSecretEnvKey(props.row.key));

function toggleReveal() {
  revealed.value = !revealed.value;
}

function onValueInput(event: Event) {
  props.row.value = (event.target as HTMLInputElement).value;
}
</script>

<template>
  <div class="cx-env-row" :data-env-key="row.key">
    <input
      v-model="row.key"
      class="cx-field cx-field-key"
      :placeholder="t('admin.envKey')"
      :aria-label="t('admin.envKey')"
    />
    <input
      :value="visibleEnvValue(row.value, revealed, secret)"
      :type="secretRow && !revealed ? 'password' : 'text'"
      class="cx-field min-w-0 flex-1"
      :placeholder="t('admin.envValue')"
      :aria-label="t('admin.envValue')"
      @input="onValueInput"
    />
    <UiIconButton
      v-if="secretRow"
      size="sm"
      :active="revealed"
      :label="revealed ? t('admin.hide') : t('admin.reveal')"
      @click="toggleReveal"
    >
      <EyeOff v-if="revealed" class="h-3.5 w-3.5" />
      <Eye v-else class="h-3.5 w-3.5" />
    </UiIconButton>
    <span v-else class="h-6 w-6 shrink-0" aria-hidden="true" />
    <UiIconButton size="sm" :label="t('admin.removeKey')" @click="emit('remove')">
      <Trash2 class="h-3.5 w-3.5" />
    </UiIconButton>
  </div>
</template>
