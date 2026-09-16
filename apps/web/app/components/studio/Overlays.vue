<script setup lang="ts">
import { Command } from "@lucide/vue";
import type { StudioDialog, StudioPayload, StudioSheet } from "~/types/studio";
import type { SessionEvent } from "@atelier/contracts";

const props = defineProps<{
  data: StudioPayload;
  sheet: StudioSheet;
  dialog: StudioDialog;
  paletteQuery: string;
  commands: Array<{ id: string; label: string; keys?: string; run: () => void }>;
  filteredCommands: Array<{ id: string; label: string; keys?: string; run: () => void }>;
  pendingPlan?: SessionEvent;
  pendingQuestion?: SessionEvent;
  pendingPermission?: SessionEvent;
  questionAnswers: Record<string, string[]>;
  toast: string;
}>();

const emit = defineEmits<{
  "update:sheet": [value: StudioSheet];
  "update:dialog": [value: StudioDialog];
  "update:paletteQuery": [value: string];
  command: [payload: { type: string; [key: string]: unknown }];
  saveRules: [];
  patchFlags: [flags: Record<string, boolean>];
  copyInvite: [];
  copyShare: [];
  hibernate: [];
  sync: [];
  "update:questionAnswers": [value: Record<string, string[]>];
}>();

const { t, locale, setLocale } = useI18n();

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
  if (!props.pendingQuestion || props.pendingQuestion.type !== "question") return;
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
  <div v-if="data.divergence.pendingInBranch.length || data.divergence.extraInDatabase.length || data.lock" class="pointer-events-none absolute inset-x-0 top-14 z-20 flex flex-col gap-2 px-4 pt-2">
    <div v-if="data.divergence.pendingInBranch.length || data.divergence.extraInDatabase.length" class="pointer-events-auto rounded-[10px] border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100 shadow-lift">
      <p class="font-semibold">{{ t("workspace.divergence") }}</p>
      <p v-if="data.divergence.pendingInBranch.length">{{ t("workspace.pendingMigrations", { count: data.divergence.pendingInBranch.length }) }}</p>
      <p v-if="data.divergence.extraInDatabase.length">{{ t("workspace.extraMigrations", { count: data.divergence.extraInDatabase.length }) }}</p>
    </div>
    <div v-if="data.lock && data.lock.sessionId !== data.session?.id" class="pointer-events-auto rounded-xl border border-line bg-paper px-3 py-2 text-[12px] text-ink-700 shadow-lift">
      {{ t("workspace.lockHeld") }}
    </div>
  </div>

  <div v-if="toast" class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[10px] border border-line bg-paper px-4 py-2 text-[13px] font-medium text-ink-950 shadow-float">
    {{ toast }}
  </div>

  <div v-if="dialog === 'palette'" class="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-8 backdrop-blur-md" @click.self="emit('update:dialog', null)">
    <div class="glass-window w-full max-w-lg overflow-hidden p-3">
      <div class="flex items-center gap-2 px-2">
        <Command class="h-4 w-4 text-ink-300" />
        <input
          :value="paletteQuery"
          :placeholder="t('command.placeholder')"
          class="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-300"
          @input="emit('update:paletteQuery', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <ul class="mt-1">
        <li v-if="!filteredCommands.length" class="px-3 py-2 text-sm text-ink-300">{{ t("command.empty") }}</li>
        <li v-for="cmd in filteredCommands" :key="cmd.id">
          <button
            class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-canvas"
            @click="runPaletteCommand(cmd)"
          >
            <span>{{ cmd.label }}</span>
            <UiKbd v-if="cmd.keys">{{ cmd.keys }}</UiKbd>
          </button>
        </li>
      </ul>
    </div>
  </div>

  <UiSheet :open="sheet === 'rules'" :title="t('rules.title')" @close="emit('update:sheet', null)">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("rules.hint") }}</p>
    <label v-for="layer in data.rules" :key="layer.id" class="mt-4 block">
      <span class="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{
        layer.level === "platform" ? t("rules.platform") : layer.level === "project" ? t("rules.project") : t("rules.user")
      }}</span>
      <p class="mb-1 text-[12px] text-ink-400">
        {{ layer.level === "platform" ? t("rules.platformHint") : layer.level === "project" ? t("rules.projectHint") : t("rules.userHint") }}
      </p>
      <textarea v-model="layer.body" class="mt-1 h-28 w-full rounded-[10px] border border-line bg-white/5 p-3 text-sm outline-none focus:border-coral-500/40" />
    </label>
    <template #footer>
      <UiButton class="w-full" @click="emit('saveRules')">{{ t("rules.save") }}</UiButton>
    </template>
  </UiSheet>

  <UiSheet :open="sheet === 'connections'" :title="t('connections.title')" @close="emit('update:sheet', null)">
    <p class="text-sm text-ink-500">{{ t("connections.erpReadOnly") }}</p>
    <p class="mt-1 text-sm text-ink-500">{{ t("connections.appMigrate") }}</p>
    <p v-if="!data.connections.length" class="mt-3 text-sm text-ink-400">{{ t("connections.empty") }}</p>
    <article v-for="conn in data.connections" :key="conn.id" class="mt-3 rounded-2xl border border-line bg-canvas/60 p-3">
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
      <select
        class="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        :value="locale"
        @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
      >
        <option value="pt-BR">{{ t("auth.portuguese") }}</option>
        <option value="en">{{ t("auth.english") }}</option>
      </select>
    </div>
    <p class="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("flags.title") }}</p>
    <p class="mt-1 text-[12px] text-ink-500">{{ t("flags.hint") }}</p>
    <label class="mt-3 flex items-center justify-between">
      <span class="text-sm">{{ t("flags.publish") }}</span>
      <UiSwitch :model-value="!!data.flags?.publish" :label="t('flags.publish')" @update:model-value="emit('patchFlags', { publish: $event })" />
    </label>
    <label class="mt-3 flex items-center justify-between">
      <span class="text-sm">{{ t("flags.multiProvider") }}</span>
      <UiSwitch :model-value="!!data.flags?.multiProvider" :label="t('flags.multiProvider')" @update:model-value="emit('patchFlags', { multiProvider: $event })" />
    </label>
    <label class="mt-3 flex items-center justify-between">
      <span class="text-sm">{{ t("flags.spectator") }}</span>
      <UiSwitch :model-value="!!data.flags?.spectator" :label="t('flags.spectator')" @update:model-value="emit('patchFlags', { spectator: $event })" />
    </label>
    <label class="mt-3 flex items-center justify-between">
      <span class="text-sm">{{ t("flags.recipes") }}</span>
      <UiSwitch :model-value="!!data.flags?.recipes" :label="t('flags.recipes')" @update:model-value="emit('patchFlags', { recipes: $event })" />
    </label>
    <p class="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("workspace.diskQuota") }}</p>
    <p class="mt-1 text-sm text-ink-600">{{ t("workspace.quotaUsed", { used: data.quota.usedMb, limit: data.quota.limitMb }) }}</p>
    <div class="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
      <div class="h-full bg-coral-500" :style="{ width: `${Math.min(100, (data.quota.usedMb / data.quota.limitMb) * 100)}%` }" />
    </div>
    <p class="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("settings.envFileTitle") }}</p>
    <p class="mt-1 text-[12px] text-ink-500">{{ t("settings.envFileHint", { path: data.worktreeEnvPath }) }}</p>
    <p class="mt-1 font-mono text-[11px] text-ink-700">{{ data.worktreeEnvPath }}</p>
    <p class="mt-2 text-[12px] text-ink-500">{{ t("settings.platformEnvHint") }}</p>
    <p class="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("workspace.envIsolation") }}</p>
    <p class="mt-1 text-[12px] text-ink-500">{{ t("settings.isolationHint") }}</p>
    <ul class="mt-2 space-y-1 font-mono text-[11px] text-ink-600">
      <li v-for="(value, key) in data.env.env" :key="key">{{ key }}={{ value }}</li>
    </ul>
    <p class="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("workspace.migrationJournal") }}</p>
    <p v-if="!data.migrationLog.length" class="mt-1 text-sm text-ink-400">{{ t("workspace.noMigrations") }}</p>
    <ul v-else class="mt-2 space-y-2 text-[12px] text-ink-600">
      <li v-for="row in data.migrationLog" :key="row.id">{{ row.author }} · {{ row.name }}</li>
    </ul>
    <div class="mt-6 flex gap-2">
      <UiButton size="sm" variant="outline" @click="emit('sync')">{{ t("workspace.syncBase") }}</UiButton>
      <UiButton size="sm" variant="outline" @click="emit('hibernate')">{{ t("workspace.hibernate") }}</UiButton>
    </div>
  </UiSheet>

  <UiDialog :open="dialog === 'invite'" :title="t('invite.title')" @close="emit('update:dialog', null)">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("invite.hint") }}</p>
    <p class="mt-2 text-[12px] text-ink-300">{{ t("invite.expires") }}</p>
    <UiButton class="mt-4 w-full" @click="emit('copyInvite')">{{ t("nav.invite") }}</UiButton>
  </UiDialog>

  <UiDialog :open="dialog === 'share'" :title="t('share.title')" @close="emit('update:dialog', null)">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("share.hint") }}</p>
    <p class="mt-2 text-[12px] text-ink-300">{{ t("share.expires") }}</p>
    <UiButton class="mt-4 w-full" @click="emit('copyShare')">{{ t("share.copy") }}</UiButton>
  </UiDialog>

  <UiDialog :open="dialog === 'shortcuts'" :title="t('nav.shortcuts')" @close="emit('update:dialog', null)">
    <ul class="space-y-2">
      <li v-for="cmd in commands.filter((c) => c.keys)" :key="cmd.id" class="flex items-center justify-between text-sm">
        <span>{{ cmd.label }}</span>
        <UiKbd>{{ cmd.keys }}</UiKbd>
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
          class="rounded-full border px-3 py-1.5 text-[13px]"
          :class="(questionAnswers[question.id] ?? []).includes(option.id) ? 'border-coral-500 bg-coral-500 text-[#061018]' : 'border-line bg-white/5'"
          @click="toggleAnswer(question.id, option.id, question.allowMultiple)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
    <UiButton class="mt-4 w-full" @click="submitQuestion">{{ t("chat.send") }}</UiButton>
  </UiDialog>
</template>
