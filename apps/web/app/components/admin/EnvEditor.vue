<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    env: Record<string, string>;
    raw: string;
    revealUrl: string;
    showFooter?: boolean;
  }>(),
  { showFooter: true },
);

const emit = defineEmits<{
  save: [payload: { env?: Record<string, string>; raw?: string }];
}>();

const { t } = useI18n();
const mode = ref<"form" | "raw">("form");
const rows = ref<Array<{ key: string; value: string }>>([]);
const raw = ref("");
const revealed = ref<Record<string, boolean>>({});

watch(
  () => props.env,
  (next) => {
    rows.value = Object.entries(next ?? {}).map(([key, value]) => ({ key, value }));
  },
  { immediate: true, deep: true },
);

watch(
  () => props.raw,
  (text) => {
    raw.value = text ?? "";
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

defineExpose({ submit });
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="mb-3 inline-flex self-start rounded-[9px] border border-line bg-black/20 p-0.5">
      <button
        type="button"
        class="rounded-[7px] px-3 py-1 text-[12px] font-medium"
        :class="mode === 'form' ? 'bg-white/10 text-ink-950' : 'text-ink-400'"
        @click="mode = 'form'"
      >
        {{ t("admin.form") }}
      </button>
      <button
        type="button"
        class="rounded-[7px] px-3 py-1 text-[12px] font-medium"
        :class="mode === 'raw' ? 'bg-white/10 text-ink-950' : 'text-ink-400'"
        @click="mode = 'raw'"
      >
        {{ t("admin.raw") }}
      </button>
    </div>
    <div v-if="mode === 'form'" class="space-y-2">
      <div v-if="!rows.length" class="flex flex-col items-start gap-3 py-6">
        <p class="text-[13px] text-ink-400">{{ t("admin.envEmpty") }}</p>
        <UiButton size="sm" variant="outline" @click="addRow">{{ t("admin.addKey") }}</UiButton>
      </div>
      <template v-else>
        <div v-for="(row, index) in rows" :key="index" class="flex items-center gap-2">
          <input
            v-model="row.key"
            class="h-9 w-[38%] rounded-[8px] border border-line bg-black/25 px-2.5 font-mono text-[12px] outline-none focus:border-coral-500/40"
            :placeholder="t('admin.envKey')"
          />
          <input
            v-model="row.value"
            :type="isSecret(row.key) && !revealed[row.key] ? 'password' : 'text'"
            class="h-9 min-w-0 flex-1 rounded-[8px] border border-line bg-black/25 px-2.5 font-mono text-[12px] outline-none focus:border-coral-500/40"
            :placeholder="t('admin.envValue')"
          />
          <UiButton v-if="isSecret(row.key)" size="sm" variant="ghost" @click="reveal(row.key)">
            {{ revealed[row.key] ? t("admin.hide") : t("admin.reveal") }}
          </UiButton>
          <UiButton size="sm" variant="ghost" @click="removeRow(index)">{{ t("admin.removeKey") }}</UiButton>
        </div>
        <UiButton size="sm" variant="ghost" @click="addRow">{{ t("admin.addKey") }}</UiButton>
      </template>
    </div>
    <textarea
      v-else
      v-model="raw"
      class="h-64 w-full rounded-[10px] border border-line bg-black/25 p-3 font-mono text-[12px] outline-none focus:border-coral-500/40"
    />
    <div v-if="showFooter" class="admin-action-bar mt-4">
      <slot name="actions" />
      <UiButton size="sm" @click="submit">
        <slot name="save-label">{{ t("admin.saveEnv") }}</slot>
      </UiButton>
    </div>
  </div>
</template>
