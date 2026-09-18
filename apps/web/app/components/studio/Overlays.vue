<script setup lang="ts">
import { Command } from "@lucide/vue";
import type { StudioDialog, StudioMcpServer, StudioPayload, StudioPendingInvite, StudioSheet, StudioSkill, StudioWorkspaceMember, PreviewDebug } from "~/types/studio";
import type { PreviewDebugAction } from "~/utils/preview-debug-prompt";
import type { SessionEvent } from "@atelier/contracts";
import { STUDIO_SHORTCUTS } from "~/utils/studio-shortcuts";
import { formatTokens, usageBarTone, usageBarWidth } from "~/utils/usage";

const props = defineProps<{
  data: StudioPayload;
  sheet: StudioSheet;
  dialog: StudioDialog;
  linkUrl?: string;
  linkBusy?: boolean;
  inviteRole?: "editor" | "spectator";
  inviteMembers?: StudioWorkspaceMember[];
  pendingInvites?: StudioPendingInvite[];
  invitePanelBusy?: boolean;
  paletteQuery: string;
  commands: Array<{ id: string; label: string; keys?: string; run: () => void }>;
  filteredCommands: Array<{ id: string; label: string; keys?: string; run: () => void }>;
  pendingPlan?: SessionEvent;
  pendingQuestion?: SessionEvent;
  pendingPermission?: SessionEvent;
  questionAnswers: Record<string, string[]>;
  toast: string;
  debug?: PreviewDebug | null;
  debugPending?: boolean;
  debugError?: string;
  hasRuntimeError?: boolean;
  commandBusy?: boolean;
}>();

const emit = defineEmits<{
  "update:sheet": [value: StudioSheet];
  "update:dialog": [value: StudioDialog];
  "update:paletteQuery": [value: string];
  command: [payload: { type: string; [key: string]: unknown }];
  saveUserRule: [payload: { id?: string; title: string; description: string; slug: string; body: string; alwaysApply: boolean }];
  deleteUserRule: [id: string];
  saveUserEnv: [payload: { env?: Record<string, string>; raw?: string }];
  saveUserSkill: [payload: { name: string; description: string; body: string; paths?: string[]; manualOnly?: boolean }];
  deleteUserSkill: [name: string];
  saveUserMcp: [payload: { name: string; config: Record<string, unknown> }];
  deleteUserMcp: [name: string];
  toggleSkill: [payload: { name: string; enabled: boolean }];
  toggleMcp: [payload: { name: string; enabled: boolean }];
  copyInvite: [];
  createInvite: [];
  revokeInvite: [id: string];
  copyPendingInvite: [url: string];
  removeMember: [userId: string];
  leaveWorkspace: [];
  "update:inviteRole": [value: "editor" | "spectator"];
  copyShare: [];
  hibernate: [];
  sync: [];
  "update:questionAnswers": [value: Record<string, string[]>];
  debugAction: [payload: { action: PreviewDebugAction; sql?: string }];
}>();

const { t, locale } = useI18n();
const tokens = (value: number) => formatTokens(value, locale.value);

const isolationEnv = computed(() => {
  const env = props.data.env?.env ?? {};
  const origins = props.data.env?.origins ?? {};
  return Object.fromEntries(Object.entries(env).filter(([key]) => origins[key] === "isolation" || ["APP_URL", "SESSION_COOKIE", "QUEUE_NAME", "CACHE_PREFIX", "REDIS_PREFIX"].includes(key)));
});

function originLabel(origin: string) {
  if (origin === "global") return t("settings.originGlobal");
  if (origin === "user") return t("settings.originUser");
  if (origin === "isolation") return t("settings.originIsolation");
  return t("settings.originExample");
}

function onSaveUserEnv(payload: { env?: Record<string, string>; raw?: string }) {
  emit("saveUserEnv", payload);
}

type ProbeState = {
  state: "checking" | "up" | "down";
  ms?: number;
  error?: string;
};

const probes = ref<Record<string, ProbeState>>({});
const probing = ref(false);

async function probeConnections() {
  if (!props.data.workspace?.id || !props.data.connections.length) return;
  probing.value = true;
  probes.value = Object.fromEntries(props.data.connections.map((conn) => [conn.id, { state: "checking" as const }]));
  try {
    const res = await $fetch<{ probes: Array<{ id: string; ok: boolean; ms: number; error?: string }> }>(
      `/api/workspace/${props.data.workspace.id}/connections/probe`,
      { method: "POST" },
    );
    const next: Record<string, ProbeState> = {};
    for (const row of res.probes) {
      next[row.id] = { state: row.ok ? "up" : "down", ms: row.ms, error: row.error };
    }
    probes.value = next;
  } catch {
    probes.value = Object.fromEntries(
      props.data.connections.map((conn) => [conn.id, { state: "down" as const, error: "error" }]),
    );
  } finally {
    probing.value = false;
  }
}

function probeError(code?: string) {
  if (code === "timeout") return t("connections.errorTimeout");
  if (code === "refused") return t("connections.errorRefused");
  if (code === "dns") return t("connections.errorDns");
  if (code === "missing-host") return t("connections.errorMissing");
  return t("connections.errorGeneric");
}

const skills = computed(() => props.data.skills ?? []);
const mcpServers = computed(() => props.data.mcp?.servers ?? []);
const mcpPolicy = computed(() => props.data.mcp?.policy);
const canEditTools = computed(() => props.data.canEdit);

function memberRoleLabel(role: string) {
  if (role === "owner") return t("invite.roleOwner");
  if (role === "spectator") return t("invite.roleSpectator");
  return t("invite.roleEditor");
}

const guestMembers = computed(() => (props.inviteMembers ?? []).filter((row) => !row.isOwner));
const inviteRoleOptions = computed(() => [
  { id: "editor", label: t("invite.roleEditor"), description: t("invite.roleEditorHint") },
  { id: "spectator", label: t("invite.roleSpectator"), description: t("invite.roleSpectatorHint") },
]);

function sourceLabel(source: string) {
  if (source === "repo") return t("skills.source.repo");
  if (source === "platform") return t("skills.source.platform");
  if (source === "user") return t("skills.source.user");
  return t("skills.source.agent");
}

const skillDraft = ref({ name: "", description: "", paths: "", manualOnly: true, body: "" });
const editingSkill = ref<string | null>(null);
const pendingSkillDelete = ref<string | null>(null);

function startSkillEdit(skill: StudioSkill) {
  editingSkill.value = skill.name;
  skillDraft.value = {
    name: skill.name,
    description: skill.description,
    paths: skill.paths.join(", "),
    manualOnly: skill.manualOnly,
    body: skill.body ?? "",
  };
}

function startNewSkill() {
  editingSkill.value = "";
  skillDraft.value = { name: "", description: "", paths: "", manualOnly: true, body: "" };
}

function submitSkill() {
  const name = skillDraft.value.name.trim();
  if (!name) return;
  emit("saveUserSkill", {
    name,
    description: skillDraft.value.description,
    body: skillDraft.value.body,
    paths: skillDraft.value.paths.split(",").map((item) => item.trim()).filter(Boolean),
    manualOnly: skillDraft.value.manualOnly,
  });
  editingSkill.value = null;
}

const mcpDraft = ref({ name: "", url: "" });
const pendingMcpDelete = ref<string | null>(null);
const mcpProbes = ref<Record<string, { state: "checking" | "up" | "down"; error?: string }>>({});

async function probeMcp(server: StudioMcpServer) {
  if (!props.data.workspace?.id) return;
  mcpProbes.value = { ...mcpProbes.value, [server.name]: { state: "checking" } };
  try {
    const res = await $fetch<{ ok: boolean; error?: string }>(
      `/api/workspace/${props.data.workspace.id}/mcp/${encodeURIComponent(server.name)}/probe`,
      { method: "POST" },
    );
    mcpProbes.value = { ...mcpProbes.value, [server.name]: { state: res.ok ? "up" : "down", error: res.error } };
  } catch {
    mcpProbes.value = { ...mcpProbes.value, [server.name]: { state: "down", error: "error" } };
  }
}

function submitMcp() {
  const name = mcpDraft.value.name.trim();
  const url = mcpDraft.value.url.trim();
  if (!name || !url) return;
  emit("saveUserMcp", { name, config: { type: "http", url } });
  mcpDraft.value = { name: "", url: "" };
}

watch(
  () => props.sheet,
  (sheet) => {
    if (sheet === "connections") void probeConnections();
  },
);

function toggleAnswer(questionId: string, optionId: string, multiple?: boolean) {
  const current = { ...props.questionAnswers };
  const selected = current[questionId] ?? [];
  current[questionId] = multiple
    ? selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId]
    : [optionId];
  emit("update:questionAnswers", current);
}

function runPaletteCommand(cmd: { id: string; run: () => void }) {
  emit("update:dialog", null);
  cmd.run();
}

function submitQuestion() {
  if (!props.pendingQuestion || props.pendingQuestion.type !== "question" || props.commandBusy) return;
  emit("command", {
    type: "answer_question",
    answers: props.pendingQuestion.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: props.questionAnswers[q.id] ?? [],
    })),
  });
}
</script>

<template>
  <div v-if="data.divergence.pendingInBranch.length || data.divergence.extraInDatabase.length || data.lock" class="pointer-events-none absolute inset-x-0 top-10 z-20 flex flex-col gap-1.5 px-3">
    <div v-if="data.divergence.pendingInBranch.length || data.divergence.extraInDatabase.length" class="cx-panel cx-panel-warn pointer-events-auto px-3 py-2 text-[12px] leading-relaxed text-amber-100/90">
      <p class="font-medium">{{ t("workspace.divergence") }}</p>
      <p v-if="data.divergence.pendingInBranch.length">{{ t("workspace.pendingMigrations", { count: data.divergence.pendingInBranch.length }) }}</p>
      <p v-if="data.divergence.extraInDatabase.length">{{ t("workspace.extraMigrations", { count: data.divergence.extraInDatabase.length }) }}</p>
    </div>
    <div v-if="data.lock && data.lock.sessionId !== data.session?.id" class="cx-panel pointer-events-auto px-3 py-2 text-[12px] text-ink-700">
      {{ t("workspace.lockHeld") }}
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="toast"
      class="cx-panel cx-toast pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 text-ink-950"
      role="status"
    >
      {{ toast }}
    </div>
  </Teleport>

  <div v-if="dialog === 'palette'" class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-8" @click.self="emit('update:dialog', null)">
    <div class="cx-menu w-full max-w-md p-1 shadow-float">
      <div class="flex items-center gap-2 px-2">
        <Command class="h-3.5 w-3.5 text-ink-400" />
        <input
          :value="paletteQuery"
          :placeholder="t('command.placeholder')"
          class="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-400"
          @input="emit('update:paletteQuery', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="cx-divider mx-2 my-1" />
      <ul class="thin-scroll max-h-[50vh] overflow-y-auto">
        <li v-if="!filteredCommands.length" class="cx-menu-row cx-muted">{{ t("command.empty") }}</li>
        <li v-for="cmd in filteredCommands" :key="cmd.id">
          <button type="button" class="cx-menu-row" @click="runPaletteCommand(cmd)">
            <span class="min-w-0 flex-1 truncate">{{ cmd.label }}</span>
            <UiKbd v-if="cmd.keys">{{ cmd.keys }}</UiKbd>
          </button>
        </li>
      </ul>
    </div>
  </div>

  <StudioRulesSheet
    :open="sheet === 'rules'"
    :rules="data.rules"
    @close="emit('update:sheet', null)"
    @save="emit('saveUserRule', $event)"
    @delete="emit('deleteUserRule', $event)"
  />

  <UiSheet :open="sheet === 'connections'" :title="t('connections.title')" @close="emit('update:sheet', null)">
    <p class="text-sm text-ink-500">{{ t("connections.erpReadOnly") }}</p>
    <p class="mt-1 text-sm text-ink-500">{{ t("connections.appMigrate") }}</p>
    <p v-if="!data.connections.length" class="mt-3 text-sm text-ink-400">{{ t("connections.empty") }}</p>
    <article v-for="conn in data.connections" :key="conn.id" class="cx-panel mt-2 p-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">{{ conn.name }}</h3>
        <div class="flex items-center gap-1.5">
          <UiBadge v-if="probes[conn.id]?.state === 'checking'" tone="info">
            <UiSpinner size="sm" :label="t('connections.checking')" />
            {{ t("connections.checking") }}
          </UiBadge>
          <UiBadge v-else-if="probes[conn.id]?.state === 'up'" tone="live">{{ t("connections.up") }}</UiBadge>
          <UiBadge v-else-if="probes[conn.id]?.state === 'down'" tone="warn">{{ t("connections.down") }}</UiBadge>
          <UiBadge :tone="conn.kind === 'app' ? 'info' : 'neutral'">
            {{ conn.kind === "app" ? t("connections.kindApp") : t("connections.kindErp") }}
          </UiBadge>
        </div>
      </div>
      <dl class="mt-2 grid grid-cols-2 gap-2 text-[12px] text-ink-500">
        <div>
          <dt>{{ t("connections.driver") }}</dt>
          <dd class="font-mono text-ink-800">{{ conn.driver }}</dd>
        </div>
        <div>
          <dt>{{ t("connections.host") }}</dt>
          <dd class="font-mono text-ink-800">{{ conn.host }}{{ conn.port ? `:${conn.port}` : "" }}</dd>
        </div>
        <div class="col-span-2">
          <dt>{{ t("connections.database") }}</dt>
          <dd class="font-mono text-ink-800">{{ conn.database || "—" }}</dd>
        </div>
      </dl>
      <p v-if="probes[conn.id]?.state === 'up'" class="mt-2 text-[11px] font-medium text-emerald-300">
        {{ t("connections.latency", { ms: probes[conn.id].ms ?? 0 }) }}
      </p>
      <p v-else-if="probes[conn.id]?.state === 'down'" class="mt-2 text-[11px] leading-relaxed text-amber-200">
        {{ probeError(probes[conn.id].error) }}
        <template v-if="probes[conn.id].ms"> · {{ t("connections.latency", { ms: probes[conn.id].ms }) }}</template>
      </p>
      <p class="mt-2 text-[11px] font-medium text-ink-400">
        {{ conn.kind === "app" ? t("connections.migrateForward") : t("connections.readOnly") }} · {{ t("connections.homologation") }}
      </p>
    </article>
    <template #footer>
      <UiButton class="w-full" variant="outline" :disabled="probing || !data.connections.length" @click="probeConnections">
        <UiSpinner v-if="probing" size="sm" :label="t('connections.checking')" />
        {{ probing ? t("connections.checking") : t("connections.check") }}
      </UiButton>
    </template>
  </UiSheet>

  <UiSheet :open="sheet === 'settings'" :title="t('settings.title')" @close="emit('update:sheet', null)">
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium">{{ t("settings.language") }}</p>
      <AuthLoginLocale />
    </div>
    <div class="mt-5 flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium">{{ t("settings.theme") }}</p>
        <p class="mt-1 text-[12px] text-ink-500">{{ t("settings.themeHint") }}</p>
      </div>
      <ThemeSwatches />
    </div>
    <p class="mt-5 text-[12px] text-ink-400">{{ t("workspace.diskQuota") }}</p>
    <p class="mt-1 text-sm text-ink-600">{{ t("workspace.quotaUsed", { used: data.quota.usedMb, limit: data.quota.limitMb }) }}</p>
    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
      <div class="h-full bg-coral-500" :style="{ width: `${Math.min(100, (data.quota.usedMb / data.quota.limitMb) * 100)}%` }" />
    </div>
    <p class="mt-5 text-[12px] text-ink-400">{{ t("usage.title") }}</p>
    <p class="mt-1 text-sm text-ink-600">
      <span v-if="data.usage?.unlimited">{{ t("usage.unlimited", { profile: data.usage.profileLabel }) }}</span>
      <span v-else-if="data.usage">
        {{ t("usage.remaining", { remaining: tokens(data.usage.remainingTokens), limit: tokens(data.usage.limitTokens) }) }}
      </span>
    </p>
    <div v-if="data.usage && !data.usage.unlimited" class="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
      <div
        class="h-full"
        :class="usageBarTone(data.usage.decision.decision)"
        :style="{ width: usageBarWidth(data.usage) }"
      />
    </div>
    <p v-if="data.usage" class="mt-1 text-[12px] text-ink-500">
      {{ t("usage.profileHint", { profile: data.usage.profileLabel }) }}
    </p>
    <p class="mt-5 text-[12px] text-ink-400">{{ t("settings.envFileTitle") }}</p>
    <p class="mt-1 text-[12px] text-ink-500">{{ t("settings.envFileHint") }}</p>
    <p class="mt-2 text-[12px] text-ink-500">{{ t("settings.platformEnvHint") }}</p>
    <AdminEnvEditor
      class="mt-3"
      :env="data.userEnv?.env ?? {}"
      :raw="data.userEnv?.raw ?? ''"
      :secrets="data.userEnv?.secrets"
      @save="onSaveUserEnv"
    >
      <template #save-label>{{ t("settings.overlaySave") }}</template>
    </AdminEnvEditor>
    <p class="mt-5 text-[12px] text-ink-400">{{ t("workspace.envIsolation") }}</p>
    <p class="mt-1 text-[12px] text-ink-500">{{ t("settings.isolationHint") }}</p>
    <ul class="mt-2 space-y-1 font-mono text-[11px] text-ink-600">
      <li v-for="(value, key) in isolationEnv" :key="key">
        {{ key }}={{ value }}
        <span v-if="data.env.origins?.[key]" class="text-ink-300"> · {{ originLabel(data.env.origins[key]) }}</span>
      </li>
    </ul>
    <p class="mt-5 text-[12px] text-ink-400">{{ t("workspace.migrationJournal") }}</p>
    <p v-if="!data.migrationLog.length" class="mt-1 text-sm text-ink-400">{{ t("workspace.noMigrations") }}</p>
    <ul v-else class="mt-2 space-y-2 text-[12px] text-ink-600">
      <li v-for="row in data.migrationLog" :key="row.id">{{ row.author }} · {{ row.name }}</li>
    </ul>
    <div class="mt-6 flex gap-2">
      <UiButton size="sm" variant="outline" @click="emit('sync')">{{ t("workspace.syncBase") }}</UiButton>
      <UiButton v-if="data.canHibernate" size="sm" variant="outline" @click="emit('hibernate')">{{ t("workspace.hibernate") }}</UiButton>
    </div>
  </UiSheet>

  <UiSheet :open="sheet === 'skills'" :title="t('skills.title')" @close="emit('update:sheet', null)">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("skills.hint") }}</p>
    <p v-if="!skills.length" class="mt-3 text-sm text-ink-400">{{ t("skills.empty") }}</p>
    <article v-for="skill in skills" :key="skill.source + skill.name" class="cx-panel mt-2 p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="font-mono text-sm text-ink-950">/{{ skill.name }}</p>
          <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ skill.description }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <UiBadge :tone="skill.shadowed ? 'warn' : skill.source === 'repo' ? 'info' : 'neutral'">
            {{ skill.shadowed ? t("skills.shadowed") : sourceLabel(skill.source) }}
          </UiBadge>
          <UiSwitch
            v-if="canEditTools && !skill.shadowed"
            :model-value="skill.enabled"
            :label="skill.name"
            @update:model-value="emit('toggleSkill', { name: skill.name, enabled: $event })"
          />
        </div>
      </div>
      <p v-if="skill.manualOnly" class="mt-2 text-[11px] text-ink-400">{{ t("skills.manualOnly") }}</p>
      <p v-if="skill.paths.length" class="mt-1 font-mono text-[11px] text-ink-400">{{ skill.paths.join(", ") }}</p>
      <p v-for="issue in skill.issues" :key="issue" class="mt-1 text-[11px] text-amber-200/80">{{ issue }}</p>
      <pre v-if="skill.source === 'repo' && skill.body" class="thin-scroll mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink-600">{{ skill.body }}</pre>
      <div v-if="skill.editable && canEditTools" class="mt-2 flex gap-1.5">
        <UiButton size="sm" variant="outline" @click="startSkillEdit(skill)">{{ t("skills.edit") }}</UiButton>
        <UiButton size="sm" variant="ghost" @click="pendingSkillDelete = skill.name">{{ t("skills.delete") }}</UiButton>
      </div>
    </article>
    <div v-if="canEditTools" class="mt-4">
      <UiButton v-if="editingSkill === null" size="sm" variant="outline" @click="startNewSkill">{{ t("skills.add") }}</UiButton>
      <form v-else class="space-y-2" @submit.prevent="submitSkill">
        <label class="block text-[12px] text-ink-400">
          {{ t("skills.name") }}
          <input v-model="skillDraft.name" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" :readonly="Boolean(editingSkill)" />
        </label>
        <label class="block text-[12px] text-ink-400">
          {{ t("skills.description") }}
          <input v-model="skillDraft.description" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" />
        </label>
        <label class="block text-[12px] text-ink-400">
          {{ t("skills.paths") }}
          <input v-model="skillDraft.paths" class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" />
        </label>
        <label class="flex items-center justify-between text-[12px] text-ink-400">
          {{ t("skills.manualOnly") }}
          <UiSwitch :model-value="skillDraft.manualOnly" :label="t('skills.manualOnly')" @update:model-value="skillDraft.manualOnly = $event" />
        </label>
        <label class="block text-[12px] text-ink-400">
          {{ t("skills.body") }}
          <textarea v-model="skillDraft.body" class="mt-1 h-28 w-full rounded-[6px] border border-line bg-white/[0.03] p-2.5 text-[12.5px] outline-none" />
        </label>
        <div class="flex gap-1.5">
          <UiButton size="sm" type="submit">{{ t("skills.save") }}</UiButton>
          <UiButton size="sm" variant="outline" @click="editingSkill = null">{{ t("admin.removeKeyCancel") }}</UiButton>
        </div>
      </form>
    </div>
  </UiSheet>

  <UiSheet :open="sheet === 'mcp'" :title="t('mcp.title')" @close="emit('update:sheet', null)">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("mcp.hint") }}</p>
    <p v-if="!mcpServers.length" class="mt-3 text-sm text-ink-400">{{ t("mcp.empty") }}</p>
    <article v-for="server in mcpServers" :key="server.source + server.name" class="cx-panel mt-2 p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-ink-950">{{ server.name }}</p>
          <p class="mt-1 truncate font-mono text-[11px] text-ink-500">{{ server.target }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <UiBadge :tone="server.shadowed ? 'warn' : server.enabled ? 'live' : 'neutral'">
            {{ server.shadowed ? t("skills.shadowed") : sourceLabel(server.source) }}
          </UiBadge>
          <UiSwitch
            v-if="canEditTools && !server.shadowed"
            :model-value="server.enabled"
            :label="server.name"
            @update:model-value="emit('toggleMcp', { name: server.name, enabled: $event })"
          />
        </div>
      </div>
      <p class="mt-2 text-[11px] uppercase tracking-wide text-ink-400">{{ server.transport }}</p>
      <p v-if="server.secrets" class="mt-1 text-[11px] text-ink-400">{{ t("mcp.secrets") }}</p>
      <p v-for="issue in server.issues" :key="issue" class="mt-1 text-[11px] text-amber-200/80">{{ issue }}</p>
      <p v-if="mcpProbes[server.name]?.state === 'up'" class="mt-2 text-[11px] text-emerald-300">{{ t("mcp.probeOk") }}</p>
      <p v-else-if="mcpProbes[server.name]?.state === 'down'" class="mt-2 text-[11px] text-amber-200">{{ t("mcp.probeFail") }}</p>
      <div class="mt-2 flex gap-1.5">
        <UiButton size="sm" variant="outline" :disabled="mcpProbes[server.name]?.state === 'checking'" @click="probeMcp(server)">
          {{ mcpProbes[server.name]?.state === "checking" ? t("mcp.probing") : t("mcp.probe") }}
        </UiButton>
        <UiButton v-if="server.editable && canEditTools" size="sm" variant="ghost" @click="pendingMcpDelete = server.name">
          {{ t("mcp.delete") }}
        </UiButton>
      </div>
    </article>
    <form v-if="canEditTools && mcpPolicy?.allowUserServers" class="mt-4 space-y-2" @submit.prevent="submitMcp">
      <p class="text-[12px] text-ink-400">{{ t("mcp.add") }}</p>
      <input v-model="mcpDraft.name" class="h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" :placeholder="t('mcp.name')" />
      <input v-model="mcpDraft.url" class="h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 text-[12.5px] outline-none" :placeholder="t('mcp.url')" />
      <UiButton size="sm" type="submit">{{ t("mcp.save") }}</UiButton>
    </form>
  </UiSheet>

  <UiDialog :open="pendingSkillDelete != null" :title="t('skills.deleteTitle', { name: pendingSkillDelete ?? '' })" @close="pendingSkillDelete = null">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("skills.deleteBody") }}</p>
    <div class="mt-4 flex justify-end gap-2">
      <UiButton size="sm" variant="outline" @click="pendingSkillDelete = null">{{ t("admin.removeKeyCancel") }}</UiButton>
      <UiButton
        size="sm"
        variant="danger"
        @click="pendingSkillDelete && emit('deleteUserSkill', pendingSkillDelete); pendingSkillDelete = null"
      >
        {{ t("skills.delete") }}
      </UiButton>
    </div>
  </UiDialog>

  <UiDialog :open="pendingMcpDelete != null" :title="t('mcp.deleteTitle', { name: pendingMcpDelete ?? '' })" @close="pendingMcpDelete = null">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("mcp.deleteBody") }}</p>
    <div class="mt-4 flex justify-end gap-2">
      <UiButton size="sm" variant="outline" @click="pendingMcpDelete = null">{{ t("admin.removeKeyCancel") }}</UiButton>
      <UiButton
        size="sm"
        variant="danger"
        @click="pendingMcpDelete && emit('deleteUserMcp', pendingMcpDelete); pendingMcpDelete = null"
      >
        {{ t("mcp.delete") }}
      </UiButton>
    </div>
  </UiDialog>

  <StudioPreviewDebugSheet
    :open="sheet === 'debug'"
    :debug="debug"
    :pending="debugPending"
    :last-error="debugError"
    :has-runtime-error="hasRuntimeError"
    @close="emit('update:sheet', null)"
    @action="emit('debugAction', $event)"
  />

  <UiDialog
    :open="dialog === 'invite'"
    :title="data.canInvite ? t('invite.title') : t('invite.peopleTitle')"
    @close="emit('update:dialog', null)"
  >
    <p v-if="data.canInvite" class="text-sm leading-relaxed text-ink-500">{{ t("invite.hint") }}</p>
    <p v-if="data.canInvite" class="mt-2 text-[12px] text-ink-300">{{ t("invite.expires") }}</p>
    <p v-if="invitePanelBusy" class="mt-3 text-[12.5px] text-ink-400">{{ t("invite.loading") }}</p>
    <div class="mt-4 space-y-2">
      <p class="text-[11px] text-ink-400">{{ t("invite.members") }}</p>
      <div
        v-for="member in inviteMembers"
        :key="member.userId"
        class="flex items-center justify-between gap-2 rounded-[6px] border border-line/70 px-2 py-1.5"
      >
        <div class="min-w-0">
          <p class="truncate text-[13px] text-ink-950">
            {{ member.login || member.name }}
            <span v-if="member.userId === data.user.id" class="text-ink-400"> · {{ t("invite.you") }}</span>
          </p>
          <p class="text-[11px] text-ink-400">{{ memberRoleLabel(member.role) }}</p>
        </div>
        <UiButton
          v-if="data.canInvite && !member.isOwner"
          size="sm"
          variant="ghost"
          @click="emit('removeMember', member.userId)"
        >
          {{ t("invite.remove") }}
        </UiButton>
      </div>
      <p v-if="!invitePanelBusy && !guestMembers.length" class="text-[12px] text-ink-400">{{ t("invite.emptyMembers") }}</p>
    </div>
    <template v-if="data.canInvite">
      <div class="mt-4 space-y-2">
        <p class="text-[11px] text-ink-400">{{ t("invite.pendingLinks") }}</p>
        <div
          v-for="invite in pendingInvites"
          :key="invite.id"
          class="flex items-center justify-between gap-2 rounded-[6px] border border-line/70 px-2 py-1.5"
        >
          <div class="min-w-0">
            <p class="truncate font-mono text-[12px] text-ink-800">{{ invite.url }}</p>
            <p class="text-[11px] text-ink-400">
              {{ memberRoleLabel(invite.role) }} · {{ t("invite.expiresOn", { date: invite.expiresAt.slice(0, 10) }) }}
            </p>
          </div>
          <div class="flex shrink-0 gap-1">
            <UiButton size="sm" variant="ghost" @click="emit('copyPendingInvite', invite.url)">{{ t("invite.copy") }}</UiButton>
            <UiButton size="sm" variant="ghost" @click="emit('revokeInvite', invite.id)">{{ t("invite.revoke") }}</UiButton>
          </div>
        </div>
        <p v-if="!invitePanelBusy && !pendingInvites?.length" class="text-[12px] text-ink-400">{{ t("invite.emptyPending") }}</p>
      </div>
      <label class="mt-4 block">
        <span class="text-[11px] text-ink-400">{{ t("invite.role") }}</span>
        <UiSelect
          class="mt-1 w-full"
          :model-value="inviteRole"
          :options="inviteRoleOptions"
          :allow-empty="false"
          :aria-label="t('invite.role')"
          @update:model-value="emit('update:inviteRole', $event === 'spectator' ? 'spectator' : 'editor')"
        />
      </label>
      <UiButton class="mt-3 w-full" :loading="linkBusy" @click="emit('createInvite')">
        {{ t("invite.generate") }}
      </UiButton>
      <label v-if="linkUrl" class="mt-3 block">
        <span class="text-[11px] text-ink-400">{{ t("invite.linkLabel") }}</span>
        <input
          :value="linkUrl"
          readonly
          class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 font-mono text-[12px] text-ink-950 outline-none"
          @focus="($event.target as HTMLInputElement).select()"
        />
      </label>
      <UiButton v-if="linkUrl" class="mt-2 w-full" variant="outline" :disabled="!linkUrl" @click="emit('copyInvite')">
        {{ t("invite.copy") }}
      </UiButton>
    </template>
    <UiButton
      v-else-if="!data.isOwner"
      class="mt-4 w-full"
      variant="outline"
      @click="emit('leaveWorkspace')"
    >
      {{ t("invite.leave") }}
    </UiButton>
  </UiDialog>

  <UiDialog :open="dialog === 'share'" :title="t('share.title')" @close="emit('update:dialog', null)">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("share.hint") }}</p>
    <p class="mt-2 text-[12px] text-ink-300">{{ t("share.expires") }}</p>
    <p v-if="!data.canEdit" class="mt-3 text-[12.5px] text-amber-200/90">{{ t("share.forbidden") }}</p>
    <template v-else>
      <label class="mt-4 block">
        <span class="text-[11px] text-ink-400">{{ t("share.linkLabel") }}</span>
        <input
          :value="linkUrl"
          readonly
          :placeholder="linkBusy ? t('nav.working') : ''"
          class="mt-1 h-8 w-full rounded-[6px] border border-line bg-white/[0.03] px-2 font-mono text-[12px] text-ink-950 outline-none"
          @focus="($event.target as HTMLInputElement).select()"
        />
      </label>
      <UiButton class="mt-3 w-full" :loading="linkBusy" :disabled="!linkUrl" @click="emit('copyShare')">
        {{ t("share.copy") }}
      </UiButton>
    </template>
  </UiDialog>

  <UiDialog :open="dialog === 'shortcuts'" :title="t('nav.shortcuts')" @close="emit('update:dialog', null)">
    <ul class="space-y-2">
      <li v-for="row in STUDIO_SHORTCUTS" :key="row.id" class="flex items-center justify-between text-sm">
        <span>{{ t(row.labelKey) }}</span>
        <UiKbd>{{ row.keys }}</UiKbd>
      </li>
    </ul>
  </UiDialog>

  <UiDialog v-if="pendingQuestion && pendingQuestion.type === 'question'" :open="true" :title="t('chat.questionTitle')" @close="() => {}">
    <p class="text-sm font-medium">{{ pendingQuestion.title }}</p>
    <div v-for="question in pendingQuestion.questions" :key="question.id" class="mt-3">
      <p class="text-[12px] text-ink-500">{{ question.prompt }}</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="option in question.options"
          :key="option.id"
          type="button"
          class="rounded-[6px] border px-2.5 py-1 text-[12.5px]"
          :class="(questionAnswers[question.id] ?? []).includes(option.id) ? 'border-transparent bg-coral-500 text-on-accent' : 'border-line bg-raised text-ink-800'"
          @click="toggleAnswer(question.id, option.id, question.allowMultiple)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
    <UiButton class="mt-4 w-full" :disabled="commandBusy" :loading="commandBusy" @click="submitQuestion">{{ t("chat.send") }}</UiButton>
  </UiDialog>
</template>
