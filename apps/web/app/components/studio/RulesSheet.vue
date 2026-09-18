<script setup lang="ts">
import type { StudioRule } from "~/types/studio";

const props = defineProps<{
  open: boolean;
  rules: StudioRule[];
}>();

const emit = defineEmits<{
  close: [];
  save: [payload: { id?: string; title: string; description: string; slug: string; body: string; alwaysApply: boolean }];
  delete: [id: string];
}>();

const { t } = useI18n();

const expanded = ref<string | null>(null);
const editingId = ref<string | null>(null);
const pendingDelete = ref<StudioRule | null>(null);
const draft = ref({ title: "", description: "", slug: "", body: "", alwaysApply: true });

const platformRules = computed(() => props.rules.filter((row) => row.level === "platform"));
const projectRules = computed(() => props.rules.filter((row) => row.level === "project"));
const userRules = computed(() => props.rules.filter((row) => row.level === "user"));

watch(
  () => props.open,
  (open) => {
    if (open) return;
    expanded.value = null;
    editingId.value = null;
    pendingDelete.value = null;
  },
);

function sourceLabel(rule: StudioRule) {
  if (rule.origin === "repo") return t("rules.repo");
  if (rule.level === "platform") return t("rules.platform");
  if (rule.level === "project") return t("rules.project");
  return t("rules.user");
}

function applyBadge(rule: StudioRule) {
  return rule.alwaysApply ? t("rules.applied") : t("rules.requestable");
}

function startCreate() {
  editingId.value = "";
  draft.value = { title: "", description: "", slug: "", body: "", alwaysApply: true };
}

function startEdit(rule: StudioRule) {
  editingId.value = rule.id;
  draft.value = {
    title: rule.title,
    description: rule.description,
    slug: rule.slug,
    body: rule.body,
    alwaysApply: rule.alwaysApply,
  };
}

function submit() {
  const title = draft.value.title.trim();
  const body = draft.value.body.trim();
  if (!title || !body) return;
  emit("save", {
    id: editingId.value || undefined,
    title,
    description: draft.value.description,
    slug: draft.value.slug,
    body,
    alwaysApply: draft.value.alwaysApply,
  });
  editingId.value = null;
}

function confirmDelete() {
  if (!pendingDelete.value) return;
  emit("delete", pendingDelete.value.id);
  pendingDelete.value = null;
}
</script>

<template>
  <UiSheet :open="open" :title="t('rules.title')" @close="emit('close')">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("rules.hint") }}</p>
    <p class="mt-2 text-[12px] text-ink-400">{{ t("rules.userHint") }}</p>

    <section class="mt-4">
      <p class="text-[11px] font-medium uppercase tracking-wide text-ink-400">{{ t("rules.platform") }}</p>
      <p class="mt-0.5 text-[12px] text-ink-400">{{ t("rules.platformHint") }}</p>
      <article v-for="rule in platformRules" :key="rule.id" class="cx-panel mt-2 p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="font-mono text-sm text-ink-950">{{ rule.slug }}</p>
            <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ rule.description }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <UiBadge tone="neutral">{{ sourceLabel(rule) }}</UiBadge>
            <UiBadge :tone="rule.alwaysApply ? 'live' : 'info'">{{ applyBadge(rule) }}</UiBadge>
          </div>
        </div>
        <UiButton class="mt-2" size="sm" variant="ghost" @click="expanded = expanded === rule.id ? null : rule.id">
          {{ t("rules.view") }}
        </UiButton>
        <pre v-if="expanded === rule.id" class="thin-scroll mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink-600">{{ rule.body }}</pre>
      </article>
    </section>

    <section class="mt-5">
      <p class="text-[11px] font-medium uppercase tracking-wide text-ink-400">{{ t("rules.project") }}</p>
      <p class="mt-0.5 text-[12px] text-ink-400">{{ t("rules.projectHint") }}</p>
      <article v-for="rule in projectRules" :key="rule.id" class="cx-panel mt-2 p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="font-mono text-sm text-ink-950">{{ rule.origin === "repo" ? rule.title : rule.slug }}</p>
            <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ rule.origin === "repo" ? t("rules.repoHint") : rule.description }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <UiBadge :tone="rule.origin === 'repo' ? 'info' : 'neutral'">{{ sourceLabel(rule) }}</UiBadge>
            <UiBadge :tone="rule.alwaysApply ? 'live' : 'info'">{{ applyBadge(rule) }}</UiBadge>
          </div>
        </div>
        <UiButton class="mt-2" size="sm" variant="ghost" @click="expanded = expanded === rule.id ? null : rule.id">
          {{ t("rules.view") }}
        </UiButton>
        <pre v-if="expanded === rule.id" class="thin-scroll mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink-600">{{ rule.body }}</pre>
      </article>
    </section>

    <section class="mt-5">
      <p class="text-[11px] font-medium uppercase tracking-wide text-ink-400">{{ t("rules.user") }}</p>
      <p class="mt-0.5 text-[12px] text-ink-400">{{ t("rules.userHint") }}</p>
      <p v-if="!userRules.length && editingId === null" class="mt-3 text-sm text-ink-400">{{ t("rules.empty") }}</p>
      <article v-for="rule in userRules" :key="rule.id" class="cx-panel mt-2 p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="font-mono text-sm text-ink-950">{{ rule.slug }}</p>
            <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ rule.description }}</p>
          </div>
          <UiBadge :tone="rule.alwaysApply ? 'live' : 'info'">{{ applyBadge(rule) }}</UiBadge>
        </div>
        <div v-if="rule.editable && editingId !== rule.id" class="mt-2 flex gap-1.5">
          <UiButton size="sm" variant="outline" @click="startEdit(rule)">{{ t("rules.edit") }}</UiButton>
          <UiButton size="sm" variant="ghost" @click="pendingDelete = rule">{{ t("rules.delete") }}</UiButton>
        </div>
        <form v-if="editingId === rule.id" class="mt-2 space-y-2" @submit.prevent="submit">
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.titleLabel") }}
            <input v-model="draft.title" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" />
          </label>
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.description") }}
            <input v-model="draft.description" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" />
          </label>
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.slug") }}
            <input v-model="draft.slug" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 font-mono text-[12.5px] outline-none" />
          </label>
          <label class="flex items-center justify-between text-[12px] text-ink-400">
            {{ t("rules.alwaysApply") }}
            <UiSwitch :model-value="draft.alwaysApply" :label="t('rules.alwaysApply')" @update:model-value="draft.alwaysApply = $event" />
          </label>
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.body") }}
            <textarea v-model="draft.body" class="mt-1 h-28 w-full rounded-[6px] border border-line bg-white/[0.03] p-2.5 text-[12.5px] outline-none" />
          </label>
          <div class="flex gap-1.5">
            <UiButton size="sm" type="submit">{{ t("rules.save") }}</UiButton>
            <UiButton size="sm" variant="outline" @click="editingId = null">{{ t("admin.removeKeyCancel") }}</UiButton>
          </div>
        </form>
      </article>
      <div class="mt-3">
        <UiButton v-if="editingId === null" size="sm" variant="outline" @click="startCreate">{{ t("rules.add") }}</UiButton>
        <form v-else-if="editingId === ''" class="space-y-2" @submit.prevent="submit">
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.titleLabel") }}
            <input v-model="draft.title" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" />
          </label>
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.description") }}
            <input v-model="draft.description" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" />
          </label>
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.slug") }}
            <input v-model="draft.slug" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 font-mono text-[12.5px] outline-none" />
          </label>
          <label class="flex items-center justify-between text-[12px] text-ink-400">
            {{ t("rules.alwaysApply") }}
            <UiSwitch :model-value="draft.alwaysApply" :label="t('rules.alwaysApply')" @update:model-value="draft.alwaysApply = $event" />
          </label>
          <label class="block text-[12px] text-ink-400">
            {{ t("rules.body") }}
            <textarea v-model="draft.body" class="mt-1 h-28 w-full rounded-[6px] border border-line bg-white/[0.03] p-2.5 text-[12.5px] outline-none" />
          </label>
          <div class="flex gap-1.5">
            <UiButton size="sm" type="submit">{{ t("rules.save") }}</UiButton>
            <UiButton size="sm" variant="outline" @click="editingId = null">{{ t("admin.removeKeyCancel") }}</UiButton>
          </div>
        </form>
      </div>
    </section>
  </UiSheet>

  <UiDialog :open="pendingDelete != null" :title="t('rules.deleteTitle', { title: pendingDelete?.title ?? '' })" @close="pendingDelete = null">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("rules.deleteBody") }}</p>
    <div class="mt-4 flex justify-end gap-2">
      <UiButton size="sm" variant="outline" @click="pendingDelete = null">{{ t("admin.removeKeyCancel") }}</UiButton>
      <UiButton size="sm" variant="danger" @click="confirmDelete">{{ t("rules.delete") }}</UiButton>
    </div>
  </UiDialog>
</template>
