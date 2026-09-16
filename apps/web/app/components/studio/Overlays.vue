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
  saveUserEnv: [payload: { env?: Record<string, string>; raw?: string }];
  copyInvite: [];
  copyShare: [];
  hibernate: [];
  sync: [];
  "update:questionAnswers": [value: Record<string, string[]>];
}>();

const { t, locale, setLocale } = useI18n();

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
  <div v-if="data.divergence.pendingInBranch.length || data.divergence.extraInDatabase.length || data.lock" class="pointer-events-none absolute inset-x-0 top-10 z-20 flex flex-col gap-1.5 px-3">
    <div v-if="data.divergence.pendingInBranch.length || data.divergence.extraInDatabase.length" class="cx-panel pointer-events-auto border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-[12px] leading-relaxed text-amber-100/90">
      <p class="font-medium">{{ t("workspace.divergence") }}</p>
      <p v-if="data.divergence.pendingInBranch.length">{{ t("workspace.pendingMigrations", { count: data.divergence.pendingInBranch.length }) }}</p>
      <p v-if="data.divergence.extraInDatabase.length">{{ t("workspace.extraMigrations", { count: data.divergence.extraInDatabase.length }) }}</p>
    </div>
    <div v-if="data.lock && data.lock.sessionId !== data.session?.id" class="cx-panel pointer-events-auto px-3 py-2 text-[12px] text-ink-700">
      {{ t("workspace.lockHeld") }}
    </div>
  </div>

  <div v-if="toast" class="cx-panel fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-3 py-1.5 text-[12px] text-ink-950 shadow-float">
    {{ toast }}
  </div>

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
        <li v-if="!filteredCommands.length" class="cx-menu-row text-ink-400">{{ t("command.empty") }}</li>
        <li v-for="cmd in filteredCommands" :key="cmd.id">
          <button type="button" class="cx-menu-row" @click="runPaletteCommand(cmd)">
            <span class="min-w-0 flex-1 truncate">{{ cmd.label }}</span>
            <UiKbd v-if="cmd.keys">{{ cmd.keys }}</UiKbd>
          </button>
        </li>
      </ul>
    </div>
  </div>

  <UiSheet :open="sheet === 'rules'" :title="t('rules.title')" @close="emit('update:sheet', null)">
    <p class="text-sm leading-relaxed text-ink-500">{{ t("rules.hint") }}</p>
    <p class="mt-3 text-[12px] text-ink-400">{{ t("rules.lockedHint") }}</p>
    <label v-for="layer in data.rules" :key="layer.id" class="mt-4 block">
      <span class="text-[12px] text-ink-400">{{
        layer.level === "platform" ? t("rules.platform") : layer.level === "project" ? t("rules.project") : t("rules.user")
      }}</span>
      <p class="mb-1 text-[12px] text-ink-400">
        {{
          layer.level === "platform"
            ? t("rules.platformHint")
            : layer.level === "project"
              ? t("rules.projectHint")
              : t("rules.userHint")
        }}
      </p>
      <textarea
        v-model="layer.body"
        :readonly="layer.level !== 'user'"
        :class="layer.level !== 'user' ? 'opacity-70' : ''"
        class="mt-1 h-28 w-full rounded-[6px] border border-line bg-white/[0.03] p-2.5 text-[12.5px] leading-relaxed outline-none focus:border-coral-500/50"
      />
    </label>
    <template #footer>
      <UiButton class="w-full" @click="emit('saveRules')">{{ t("rules.save") }}</UiButton>
    </template>
  </UiSheet>

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
      <select
        class="rounded-[4px] border border-line bg-raised px-1.5 py-[2px] text-[11px] text-ink-800 outline-none"
        :value="locale"
        @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
      >
        <option value="pt-BR">{{ t("auth.portuguese") }}</option>
        <option value="en">{{ t("auth.english") }}</option>
      </select>
    </div>
    <p class="mt-5 text-[12px] text-ink-400">{{ t("workspace.diskQuota") }}</p>
    <p class="mt-1 text-sm text-ink-600">{{ t("workspace.quotaUsed", { used: data.quota.usedMb, limit: data.quota.limitMb }) }}</p>
    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
      <div class="h-full bg-coral-500" :style="{ width: `${Math.min(100, (data.quota.usedMb / data.quota.limitMb) * 100)}%` }" />
    </div>
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
          class="rounded-[6px] border px-2.5 py-1 text-[12.5px]"
          :class="(questionAnswers[question.id] ?? []).includes(option.id) ? 'border-transparent bg-coral-500 text-[#06101c]' : 'border-line bg-raised text-ink-800'"
          @click="toggleAnswer(question.id, option.id, question.allowMultiple)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
    <UiButton class="mt-4 w-full" @click="submitQuestion">{{ t("chat.send") }}</UiButton>
  </UiDialog>
</template>
