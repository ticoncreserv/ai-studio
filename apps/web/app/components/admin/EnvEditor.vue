<script setup lang="ts">
const props = defineProps<{
  env: Record<string, string>;
  raw: string;
  revealUrl: string;
}>();

const emit = defineEmits<{
  save: [payload: { env?: Record<string, string>; raw?: string }];
}>();

const { t } = useI18n();
const mode = ref<"form" | "raw">("form");
const rows = ref<Array<{ key: string; value: string }>>([]);
const raw = ref("");
const revealed = ref<Record<string, boolean>>({});

watch(
  () => [props.env, props.raw] as const,
  ([env, text]) => {
    rows.value = Object.entries(env).map(([key, value]) => ({ key, value }));
    raw.value = text;
  },
  { immediate: true },
);

function addRow() {
  rows.value.push({ key: "", value: "" });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

function isSecret(key: string) {
  return /password|secret|token|key|private/i.test(key) && !key.endsWith("_NAME");
}

async function reveal(key: string) {
  if (revealed.value[key]) {
    revealed.value[key] = false;
    return;
  }
  const res = await $fetch<{ key: string; value: string }>(props.revealUrl, { query: { reveal: key } });
  const row = rows.value.find((item) => item.key === key);
  if (row) row.value = res.value;
  revealed.value[key] = true;
}

function submit() {
  if (mode.value === "raw") {
    emit("save", { raw: raw.value });
    return;
  }
  const env: Record<string, string> = {};
  for (const row of rows.value) {
    if (row.key.trim()) env[row.key.trim()] = row.value;
  }
  emit("save", { env });
}
</script>

<template>
  <div>
    <div class="mb-3 flex gap-2">
      <UiButton size="sm" :variant="mode === 'form' ? 'primary' : 'outline'" @click="mode = 'form'">
        {{ t("admin.form") }}
      </UiButton>
      <UiButton size="sm" :variant="mode === 'raw' ? 'primary' : 'outline'" @click="mode = 'raw'">
        {{ t("admin.raw") }}
      </UiButton>
    </div>
    <div v-if="mode === 'form'" class="space-y-2">
      <div v-for="(row, index) in rows" :key="index" class="flex items-center gap-2">
        <input
          v-model="row.key"
          class="h-9 w-[38%] rounded-[8px] border border-line bg-white/5 px-2 font-mono text-[12px] outline-none"
          :placeholder="t('admin.envKey')"
        />
        <input
          v-model="row.value"
          :type="isSecret(row.key) && !revealed[row.key] ? 'password' : 'text'"
          class="h-9 min-w-0 flex-1 rounded-[8px] border border-line bg-white/5 px-2 font-mono text-[12px] outline-none"
          :placeholder="t('admin.envValue')"
        />
        <UiButton v-if="isSecret(row.key)" size="sm" variant="ghost" @click="reveal(row.key)">
          {{ revealed[row.key] ? t("admin.hide") : t("admin.reveal") }}
        </UiButton>
        <UiButton size="sm" variant="ghost" @click="removeRow(index)">{{ t("admin.removeKey") }}</UiButton>
      </div>
      <UiButton size="sm" variant="outline" @click="addRow">{{ t("admin.addKey") }}</UiButton>
    </div>
    <textarea
      v-else
      v-model="raw"
      class="h-64 w-full rounded-[10px] border border-line bg-white/5 p-3 font-mono text-[12px] outline-none"
    />
    <UiButton class="mt-4" @click="submit">
      <slot name="save-label">{{ t("admin.saveEnv") }}</slot>
    </UiButton>
  </div>
</template>
