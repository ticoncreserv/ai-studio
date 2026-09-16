<script setup lang="ts">
type EnvRow = { id: number; key: string; value: string };

const props = withDefaults(
  defineProps<{
    env: Record<string, string>;
    raw: string;
    secrets?: Record<string, string>;
    showFooter?: boolean;
  }>(),
  { showFooter: true },
);

const emit = defineEmits<{
  save: [payload: { env?: Record<string, string>; raw?: string }];
}>();

const { t } = useI18n();
const mode = ref<"form" | "raw">("form");
const rows = ref<EnvRow[]>([]);
const raw = ref("");
let nextRowId = 1;

function syncRows(next: Record<string, string>) {
  const byKey = new Map<string, EnvRow>();
  for (const row of rows.value) {
    if (row.key) byKey.set(row.key, row);
  }
  rows.value = Object.entries(next ?? {}).map(([key, value]) => {
    const existing = byKey.get(key);
    if (existing) {
      existing.value = value;
      return existing;
    }
    return { id: nextRowId++, key, value };
  });
}

watch(() => props.env, syncRows, { immediate: true });

watch(
  () => props.raw,
  (text) => {
    raw.value = text ?? "";
  },
  { immediate: true },
);

const pendingRemove = ref<{ index: number; key: string } | null>(null);

const pendingRemoveTitle = computed(() => {
  const key = pendingRemove.value?.key.trim();
  return t("admin.removeKeyTitle", { key: key || t("admin.removeKeyUnnamed") });
});

function addRow() {
  rows.value.push({ id: nextRowId++, key: "", value: "" });
}

function requestRemove(row: EnvRow) {
  const index = rows.value.indexOf(row);
  if (index < 0) return;
  pendingRemove.value = { index, key: row.key };
}

function cancelRemove() {
  pendingRemove.value = null;
}

function confirmRemove() {
  const pending = pendingRemove.value;
  if (pending == null) return;
  rows.value.splice(pending.index, 1);
  pendingRemove.value = null;
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
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="mb-3 inline-flex shrink-0 self-start rounded-[9px] border border-line bg-black/20 p-0.5">
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
    <div v-if="mode === 'form'" class="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto">
      <div v-if="!rows.length" class="flex flex-col items-start gap-3 py-6">
        <p class="text-[13px] text-ink-400">{{ t("admin.envEmpty") }}</p>
        <UiButton size="sm" variant="outline" @click="addRow">{{ t("admin.addKey") }}</UiButton>
      </div>
      <template v-else>
        <AdminEnvEditorRow
          v-for="row in rows"
          :key="row.id"
          :row="row"
          :secret="secrets?.[row.key]"
          @remove="requestRemove(row)"
        />
        <UiButton size="sm" variant="ghost" @click="addRow">{{ t("admin.addKey") }}</UiButton>
      </template>
    </div>
    <div v-else class="relative min-h-48 flex-1">
      <textarea
        v-model="raw"
        class="thin-scroll absolute inset-0 h-full w-full resize-none overflow-y-auto rounded-[10px] border border-line bg-black/25 p-3 font-mono text-[12px] outline-none focus:border-coral-500/40"
      />
    </div>
    <div v-if="showFooter" class="admin-action-bar mt-4 shrink-0">
      <slot name="actions" />
      <UiButton size="sm" @click="submit">
        <slot name="save-label">{{ t("admin.saveEnv") }}</slot>
      </UiButton>
    </div>
    <UiDialog :open="pendingRemove != null" :title="pendingRemoveTitle" @close="cancelRemove">
      <p class="text-sm leading-relaxed text-ink-500">{{ t("admin.removeKeyBody") }}</p>
      <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UiButton size="sm" variant="outline" data-autofocus @click="cancelRemove">
          {{ t("admin.removeKeyCancel") }}
        </UiButton>
        <UiButton size="sm" variant="danger" @click="confirmRemove">
          {{ t("admin.removeKeyConfirm") }}
        </UiButton>
      </div>
    </UiDialog>
  </div>
</template>
