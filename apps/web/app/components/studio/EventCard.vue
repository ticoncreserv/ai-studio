<script setup lang="ts">
import type { SessionEvent } from "@atelier/contracts";
import { Check, ChevronDown, Database, GitCommit, Shield, TriangleAlert, X } from "lucide-vue-next";
import { renderMarkdown, splitDiffLines } from "~/utils/markdown";

const props = defineProps<{ event: SessionEvent }>();
const emit = defineEmits<{
  command: [payload: { type: string; [key: string]: unknown }];
}>();

const { t } = useI18n();
const rel = useRelativeTime();
const open = ref(props.event.type === "diff" || props.event.type === "plan");
const html = computed(() => {
  if (props.event.type === "assistant_message" || props.event.type === "assistant_delta") {
    return renderMarkdown(props.event.text);
  }
  return "";
});
</script>

<template>
  <article>
    <div v-if="event.type === 'user_message'" class="flex justify-end">
      <div class="max-w-[92%] rounded-[14px] rounded-br-md bg-gradient-to-br from-coral-400 to-coral-600 px-4 py-3 text-[14px] leading-relaxed text-[#061018] shadow-glow">
        <p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#061018]/55">{{ t("chat.you") }}</p>
        {{ event.text }}
        <p v-if="event.mentions?.length" class="mt-2 text-[11px] text-[#061018]/60">{{ event.mentions.map((m) => `@${m}`).join(" ") }}</p>
      </div>
    </div>

    <div v-else-if="event.type === 'assistant_message' || event.type === 'assistant_delta'" class="mr-2">
      <p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("chat.agent") }}</p>
      <div class="markdown-body text-[14.5px] leading-[1.65] text-ink-800" v-html="html" />
    </div>

    <button
      v-else-if="event.type === 'tool_call'"
      type="button"
      class="flex w-full items-center gap-2 rounded-xl border border-line bg-canvas/70 px-3 py-2 text-left text-[12px] text-ink-600"
      @click="open = !open"
    >
      <span class="h-1.5 w-1.5 rounded-full" :class="event.status === 'running' ? 'bg-coral-500' : event.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500'" />
      <span class="flex-1 font-medium">
        {{ event.status === "running" ? t("chat.toolRunning", { name: event.name }) : t("chat.toolDone", { name: event.name }) }}
      </span>
      <ChevronDown class="h-3.5 w-3.5" :class="open && 'rotate-180'" />
    </button>
    <pre v-if="event.type === 'tool_call' && open && event.output" class="mt-1 overflow-auto rounded-xl bg-[#17130f] p-3 font-mono text-[11px] text-emerald-200">{{ event.output }}</pre>

    <div v-else-if="event.type === 'diff'" class="overflow-hidden rounded-[12px] border border-line bg-white/5">
      <div class="flex items-center justify-between gap-2 border-b border-line bg-white/5 px-3 py-2">
        <p class="truncate font-mono text-[11px] text-ink-600">{{ event.filePath }}</p>
        <div class="flex items-center gap-1">
          <UiBadge v-for="hunk in event.hunks" :key="hunk.id" :tone="hunk.status === 'accepted' ? 'live' : hunk.status === 'rejected' ? 'warn' : 'neutral'">
            {{ hunk.status === "accepted" ? t("chat.diffAccepted") : hunk.status === "rejected" ? t("chat.diffRejected") : t("chat.diffPending") }}
          </UiBadge>
          <UiIconButton :label="t('chat.acceptFile')" size="sm" @click="emit('command', { type: 'accept_file', filePath: event.filePath })">
            <Check class="h-3.5 w-3.5" />
          </UiIconButton>
          <UiIconButton :label="t('chat.rejectFile')" size="sm" @click="emit('command', { type: 'reject_file', filePath: event.filePath })">
            <X class="h-3.5 w-3.5" />
          </UiIconButton>
        </div>
      </div>
      <div v-for="hunk in event.hunks" :key="hunk.id" class="border-b border-line last:border-0">
        <div class="max-h-64 overflow-auto font-mono text-[11px] leading-5">
          <div
            v-for="(line, i) in splitDiffLines(hunk.oldLines, hunk.newLines)"
            :key="i"
            class="flex"
            :class="line.kind === 'add' ? 'bg-emerald-400/10 text-emerald-200' : line.kind === 'del' ? 'bg-red-400/10 text-red-300' : 'text-ink-500'"
          >
            <span class="w-6 shrink-0 text-center opacity-50">{{ line.kind === "add" ? "+" : line.kind === "del" ? "−" : " " }}</span>
            <pre class="flex-1 whitespace-pre-wrap">{{ line.text }}</pre>
          </div>
        </div>
        <div v-if="hunk.status === 'pending'" class="flex justify-end gap-2 px-3 py-2">
          <UiButton size="sm" variant="outline" @click="emit('command', { type: 'reject_hunk', hunkId: hunk.id })">{{ t("chat.rejectHunk") }}</UiButton>
          <UiButton size="sm" @click="emit('command', { type: 'accept_hunk', hunkId: hunk.id })">{{ t("chat.acceptHunk") }}</UiButton>
        </div>
      </div>
    </div>

    <ul v-else-if="event.type === 'todos'" class="space-y-1.5 rounded-2xl border border-line bg-canvas/70 px-3 py-3">
      <li class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("chat.pendingTodos") }}</li>
      <li v-for="todo in event.todos" :key="todo.id" class="flex items-center gap-2 text-[13px] text-ink-700">
        <span
          class="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[9px]"
          :class="todo.status === 'completed' ? 'bg-ink-950 text-white' : todo.status === 'in_progress' ? 'border-coral-400 text-coral-500' : ''"
        >
          <Check v-if="todo.status === 'completed'" class="h-3 w-3" />
        </span>
        <span :class="todo.status === 'completed' && 'text-ink-300 line-through'">{{ todo.content }}</span>
      </li>
    </ul>

    <div v-else-if="event.type === 'plan'" class="rounded-[12px] border border-line bg-white/5 p-4">
      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-coral-600">{{ t("chat.planTitle") }}</p>
      <h3 class="mt-1 text-[15px] font-semibold">{{ event.name }}</h3>
      <p class="mt-1 text-sm text-ink-500">{{ event.overview }}</p>
      <pre class="mt-3 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-700">{{ event.plan }}</pre>
      <div v-if="event.outcome === 'pending'" class="mt-3 flex justify-end gap-2">
        <UiButton size="sm" variant="outline" @click="emit('command', { type: 'decide_plan', outcome: 'rejected' })">{{ t("chat.rejectPlan") }}</UiButton>
        <UiButton size="sm" @click="emit('command', { type: 'decide_plan', outcome: 'accepted' })">{{ t("chat.acceptPlan") }}</UiButton>
      </div>
    </div>

    <div v-else-if="event.type === 'runtime_error'" class="flex items-start justify-between gap-3 rounded-[12px] border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-sm text-amber-100">
      <div class="flex gap-2">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <p>{{ event.message }}</p>
      </div>
      <UiButton size="sm" @click="emit('command', { type: 'fix_error', eventId: event.id })">{{ t("chat.fixThis") }}</UiButton>
    </div>

    <div v-else-if="event.type === 'checkpoint'" class="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-[12px] text-ink-500">
      <span class="inline-flex items-center gap-1.5">
        <GitCommit class="h-3.5 w-3.5" />
        {{ t("chat.checkpoint") }} · {{ event.label }}
      </span>
      <button class="font-medium text-coral-600" @click="emit('command', { type: 'restore_checkpoint', checkpointId: event.id })">{{ t("chat.restore") }}</button>
    </div>

    <div v-else-if="event.type === 'permission'" class="rounded-[12px] border border-line bg-white/5 p-4">
      <p class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">
        <Shield class="h-3.5 w-3.5" /> {{ t("chat.permissionTitle") }}
      </p>
      <p class="mt-2 text-sm text-ink-800">{{ event.title }}</p>
      <div v-if="event.outcome === 'pending'" class="mt-3 flex flex-wrap gap-2">
        <UiButton size="sm" variant="outline" @click="emit('command', { type: 'decide_permission', outcome: 'reject-once' })">{{ t("chat.rejectOnce") }}</UiButton>
        <UiButton size="sm" variant="soft" @click="emit('command', { type: 'decide_permission', outcome: 'allow-once' })">{{ t("chat.allowOnce") }}</UiButton>
        <UiButton size="sm" @click="emit('command', { type: 'decide_permission', outcome: 'allow-always' })">{{ t("chat.allowAlways") }}</UiButton>
      </div>
    </div>

    <div v-else-if="event.type === 'migration'" class="flex items-start gap-2 rounded-xl border border-line bg-canvas/80 px-3 py-2 text-[12px] text-ink-600">
      <Database class="mt-0.5 h-3.5 w-3.5" />
      <p>{{ t("chat.migrationBy", { author: event.author, name: event.name, branch: event.branch }) }}</p>
    </div>

    <p v-else-if="event.type === 'dropped_context'" class="text-[12px] text-amber-800">{{ t("chat.droppedContext", { count: event.omitted.length }) }}</p>
    <p v-else-if="event.type === 'budget'" class="text-[12px] text-amber-800">{{ t("chat.budget") }}</p>
    <p v-else-if="event.type === 'conflict'" class="text-[12px] text-ink-600">{{ t("chat.conflict") }} · {{ event.message }}</p>
    <p v-else-if="event.type !== 'question' && event.type !== 'plan'" class="mt-1 text-[11px] text-ink-300">{{ rel(event.at) }}</p>
  </article>
</template>
