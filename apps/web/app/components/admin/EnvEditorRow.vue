<script setup lang="ts">
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
  <div class="flex items-center gap-2" :data-env-key="row.key">
    <input
      v-model="row.key"
      class="h-9 w-[38%] rounded-[8px] border border-line bg-black/25 px-2.5 font-mono text-[12px] outline-none focus:border-coral-500/40"
      :placeholder="t('admin.envKey')"
    />
    <input
      :value="visibleEnvValue(row.value, revealed, secret)"
      :type="secretRow && !revealed ? 'password' : 'text'"
      class="h-9 min-w-0 flex-1 rounded-[8px] border border-line bg-black/25 px-2.5 font-mono text-[12px] outline-none focus:border-coral-500/40"
      :placeholder="t('admin.envValue')"
      @input="onValueInput"
    />
    <UiButton v-if="secretRow" size="sm" variant="ghost" @click="toggleReveal">
      {{ revealed ? t("admin.hide") : t("admin.reveal") }}
    </UiButton>
    <UiButton size="sm" variant="ghost" @click="emit('remove')">{{ t("admin.removeKey") }}</UiButton>
  </div>
</template>
