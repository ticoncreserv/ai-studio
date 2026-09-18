<script setup lang="ts">
import type { SessionEvent } from "@atelier/contracts";
import {
  Check,
  ChevronDown,
  Copy,
  CornerUpLeft,
  Database,
  FileImage,
  FileText,
  GitBranch,
  GitCommit,
  Scan,
  Shield,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  X,
} from "@lucide/vue";
import { visiblePromptText } from "@atelier/domain";
import { renderMarkdown, splitDiffLines } from "~/utils/markdown";
import { mcpServerFromToolName, slashInvocation } from "~/utils/slash";
import { toolCallPresentation } from "~/utils/tool-label";

const props = defineProps<{
  event: SessionEvent;
  enter?: boolean;
  failed?: boolean;
  commandBusy?: boolean;
  showActions?: boolean;
  copySource?: string;
  voice?: "process" | "reply";
}>();
const emit = defineEmits<{
  command: [payload: { type: string; [key: string]: unknown }];
  reuse: [text: string];
  fork: [];
  retry: [];
}>();

const { t } = useI18n();
const open = ref(props.event.type === "diff" || props.event.type === "plan");
const copied = ref(false);
const rating = ref<"up" | "down" | "">("");
const promptOpen = ref(false);

/* Cursor clamps long prompts behind a fade instead of letting them push the
   conversation down. */
const clampPrompt = computed(() => {
  if (props.event.type !== "user_message" || promptOpen.value) return false;
  const { text } = props.event;
  const visible = visiblePromptText(text);
  return visible.length > 220 || visible.split("\n").length > 5;
});

const mcpServer = computed(() => (props.event.type === "tool_call" ? mcpServerFromToolName(props.event.name) : null));

const toolLine = computed(() => (props.event.type === "tool_call" ? toolCallPresentation(props.event) : null));

const invokedSkill = computed(() => {
  if (props.event.type !== "user_message") return null;
  return props.event.skill || slashInvocation(props.event.text);
});

/* The feedback row uses the compact age Cursor shows ("1h ago"), not a phrase. */
function ago(at: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
  if (minutes < 1) return t("time.justNow");
  const value =
    minutes < 60
      ? t("time.shortMinutes", { count: minutes })
      : minutes < 60 * 24
        ? t("time.shortHours", { count: Math.floor(minutes / 60) })
        : t("time.shortDays", { count: Math.floor(minutes / (60 * 24)) });
  return t("time.agoShort", { value });
}

const html = computed(() => {
  if (props.event.type === "assistant_message" || props.event.type === "assistant_delta") {
    return renderMarkdown(props.event.text);
  }
  /* Permission titles arrive with the command in backticks; render the chip. */
  if (props.event.type === "permission") return renderMarkdown(props.event.title);
  return "";
});

const ratingKey = computed(() => `atelier:rating:${props.event.id}`);

onMounted(() => {
  if (props.event.type !== "assistant_message") return;
  const stored = localStorage.getItem(ratingKey.value);
  if (stored === "up" || stored === "down") rating.value = stored;
});

function rate(value: "up" | "down") {
  rating.value = rating.value === value ? "" : value;
  if (rating.value) localStorage.setItem(ratingKey.value, rating.value);
  else localStorage.removeItem(ratingKey.value);
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1400);
  } catch {
    /* clipboard is unavailable outside a secure context */
  }
}

function fileName(path: string) {
  return path.split("/").pop() || path;
}

function isImage(path: string) {
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path);
}

const acting = ref<string | null>(null);

watch(
  () => props.commandBusy,
  (busy, wasBusy) => {
    if (wasBusy && !busy) acting.value = null;
  },
);

const actionsLocked = computed(() => Boolean(acting.value || props.commandBusy));

function isActing(key: string) {
  return acting.value === key;
}

function act(key: string, payload?: { type: string; [key: string]: unknown }) {
  if (actionsLocked.value) return;
  acting.value = key;
  if (payload) emit("command", payload);
  else emit("retry");
}
</script>

<template>
  <article>
    <div
      v-if="event.type === 'user_message'"
      class="cx-turn-user group relative"
      :class="enter && 'cx-turn-enter'"
    >
      <div v-if="event.attachments?.length || event.inspect?.length" class="mb-2 flex flex-wrap gap-1.5">
        <span
          v-for="pin in event.inspect ?? []"
          :key="pin.note"
          class="cx-pill max-w-full"
        >
          <Scan class="h-3 w-3 shrink-0" />
          <span class="min-w-0 truncate font-mono">{{ pin.label }}</span>
        </span>
        <!-- Uploads live on the worktree filesystem, so there is no URL to preview. -->
        <span
          v-for="path in event.attachments"
          :key="path"
          class="cx-thumb flex items-center justify-center text-ink-500"
          :title="fileName(path)"
        >
          <FileImage v-if="isImage(path)" class="h-4 w-4" />
          <FileText v-else class="h-4 w-4" />
        </span>
      </div>
      <span v-if="invokedSkill" class="cx-pill mb-1.5">
        /{{ invokedSkill }}
      </span>
      <p v-if="visiblePromptText(event.text)" class="whitespace-pre-wrap pr-5" :class="clampPrompt && 'cx-turn-clamp'">{{ visiblePromptText(event.text) }}</p>
      <button
        v-if="clampPrompt || promptOpen"
        type="button"
        class="cx-turn-more"
        @click="promptOpen = !promptOpen"
      >
        {{ promptOpen ? t("chat.showLess") : t("chat.showMore") }}
      </button>
      <p v-if="event.mentions?.length" class="mt-1.5 font-mono text-[11px] text-ink-400">
        {{ event.mentions.map((name) => `#${name}`).join(" ") }}
      </p>
      <p v-if="failed" class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-200/80">
        <span>{{ t("chat.promptFailedHint") }}</span>
        <UiButton size="xs" variant="ghost" :disabled="actionsLocked" :loading="isActing('retry')" @click="act('retry')">
          {{ t("chat.retryPrompt") }}
        </UiButton>
      </p>
      <button
        type="button"
        class="absolute bottom-1.5 right-1.5 text-ink-400 opacity-0 transition-opacity hover:text-ink-950 group-hover:opacity-100 focus-visible:opacity-100"
        :title="t('chat.reuse')"
        :aria-label="t('chat.reuse')"
        @click="emit('reuse', visiblePromptText(event.text))"
      >
        <CornerUpLeft class="h-3.5 w-3.5" />
      </button>
    </div>

    <div v-else-if="event.type === 'assistant_message' || event.type === 'assistant_delta'">
      <div class="markdown-body" :data-voice="voice ?? 'reply'" v-html="html" />
      <div v-if="event.type === 'assistant_message' && showActions" class="mt-1.5 flex items-center gap-0.5">
        <UiIconButton
          :label="t('chat.helpful')"
          size="sm"
          :active="rating === 'up'"
          @click="rate('up')"
        >
          <ThumbsUp class="h-3 w-3" />
        </UiIconButton>
        <UiIconButton
          :label="t('chat.notHelpful')"
          size="sm"
          :active="rating === 'down'"
          @click="rate('down')"
        >
          <ThumbsDown class="h-3 w-3" />
        </UiIconButton>
        <UiIconButton :label="copied ? t('nav.copied') : t('chat.copy')" size="sm" @click="copyText(copySource || event.text)">
          <Check v-if="copied" class="h-3 w-3" />
          <Copy v-else class="h-3 w-3" />
        </UiIconButton>
        <UiIconButton :label="t('chat.fork')" size="sm" @click="emit('fork')">
          <GitBranch class="h-3 w-3" />
        </UiIconButton>
        <span class="ml-1 text-[11px] text-ink-400">{{ ago(event.at) }}</span>
      </div>
    </div>

    <div v-else-if="event.type === 'tool_call' && toolLine">
      <button type="button" class="cx-summary" :title="toolLine.title" @click="open = !open">
        <span
          class="h-1 w-1 shrink-0 rounded-full"
          :class="event.status === 'running' ? 'pulse-dot bg-coral-400' : event.status === 'failed' ? 'bg-red-400' : 'bg-ink-300'"
        />
        <span class="min-w-0 truncate">
          {{ toolLine.verbKey ? t(toolLine.verbKey) : toolLine.name }}
          <span v-if="toolLine.target" class="ml-1 font-mono text-[11px] text-ink-400">{{ toolLine.target }}</span>
        </span>
        <span v-if="mcpServer" class="cx-pill shrink-0">{{ mcpServer }}</span>
        <ChevronDown v-if="event.output" class="h-3 w-3 shrink-0 transition-transform" :class="open && 'rotate-180'" />
      </button>
      <pre
        v-if="open && event.output"
        class="thin-scroll mt-1 max-h-52 overflow-auto rounded-[6px] border border-line bg-surface p-2 font-mono text-[11px] leading-[1.5] text-ink-600"
      >{{ event.output }}</pre>
    </div>

    <div v-else-if="event.type === 'diff'" class="cx-panel">
      <div class="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <p class="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-600" :title="event.filePath">{{ event.filePath }}</p>
        <UiBadge
          v-if="event.hunks.some((hunk) => hunk.status === 'pending')"
          tone="neutral"
        >
          {{ t("chat.diffPending") }}
        </UiBadge>
        <UiIconButton
          :label="t('chat.acceptFile')"
          size="sm"
          :disabled="actionsLocked"
          :loading="isActing('accept-file')"
          @click="act('accept-file', { type: 'accept_file', filePath: event.filePath })"
        >
          <Check class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton
          :label="t('chat.rejectFile')"
          size="sm"
          :disabled="actionsLocked"
          :loading="isActing('reject-file')"
          @click="act('reject-file', { type: 'reject_file', filePath: event.filePath })"
        >
          <X class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
      <div v-for="hunk in event.hunks" :key="hunk.id" class="border-b border-line last:border-0">
        <div class="thin-scroll max-h-60 overflow-auto font-mono text-[11px] leading-[1.55]">
          <div
            v-for="(line, i) in splitDiffLines(hunk.oldLines, hunk.newLines)"
            :key="i"
            class="flex"
            :class="line.kind === 'add' ? 'bg-emerald-400/8 text-emerald-300/90' : line.kind === 'del' ? 'bg-red-400/8 text-red-300/90' : 'text-ink-500'"
          >
            <span class="w-5 shrink-0 text-center text-ink-300">{{ line.kind === "add" ? "+" : line.kind === "del" ? "−" : " " }}</span>
            <pre class="flex-1 whitespace-pre-wrap">{{ line.text }}</pre>
          </div>
        </div>
        <div v-if="hunk.status === 'pending'" class="cx-chat-actions px-2 py-1.5">
          <UiButton
            size="xs"
            variant="outline"
            :disabled="actionsLocked"
            :loading="isActing(`reject-hunk:${hunk.id}`)"
            @click="act(`reject-hunk:${hunk.id}`, { type: 'reject_hunk', hunkId: hunk.id })"
          >{{ t("chat.rejectHunk") }}</UiButton>
          <UiButton
            size="xs"
            :disabled="actionsLocked"
            :loading="isActing(`accept-hunk:${hunk.id}`)"
            @click="act(`accept-hunk:${hunk.id}`, { type: 'accept_hunk', hunkId: hunk.id })"
          >{{ t("chat.acceptHunk") }}</UiButton>
        </div>
        <p v-else class="px-2 py-1 text-[11px] text-ink-400">
          {{ hunk.status === "accepted" ? t("chat.diffAccepted") : t("chat.diffRejected") }}
        </p>
      </div>
    </div>

    <ul v-else-if="event.type === 'todos'" class="space-y-1">
      <li class="cx-summary">{{ t("chat.pendingTodos") }}</li>
      <li v-for="todo in event.todos" :key="todo.id" class="flex items-start gap-2 text-[12.5px] text-ink-700">
        <span
          class="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-line"
          :class="todo.status === 'completed' ? 'border-transparent bg-white/10 text-ink-950' : todo.status === 'in_progress' ? 'border-coral-500/60' : ''"
        >
          <Check v-if="todo.status === 'completed'" class="h-2.5 w-2.5" />
        </span>
        <span :class="todo.status === 'completed' && 'text-ink-400 line-through'">{{ todo.content }}</span>
      </li>
    </ul>

    <div v-else-if="event.type === 'plan'" class="cx-panel p-3">
      <p class="text-[11px] text-coral-400">{{ t("chat.planTitle") }}</p>
      <h3 v-if="event.name" class="mt-1 text-[13px] font-medium text-ink-950">{{ event.name }}</h3>
      <p v-if="event.overview" class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ event.overview }}</p>
      <pre class="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-[1.6] text-ink-700">{{ event.plan }}</pre>
      <div v-if="event.outcome === 'pending'" class="cx-chat-actions mt-2.5">
        <UiButton
          size="xs"
          variant="outline"
          :disabled="actionsLocked"
          :loading="isActing('reject-plan')"
          @click="act('reject-plan', { type: 'decide_plan', outcome: 'rejected' })"
        >{{ t("chat.rejectPlan") }}</UiButton>
        <UiButton
          size="xs"
          :disabled="actionsLocked"
          :loading="isActing('accept-plan')"
          @click="act('accept-plan', { type: 'decide_plan', outcome: 'accepted' })"
        >{{ t("chat.acceptPlan") }}</UiButton>
      </div>
      <p v-else class="mt-2 text-[11px] text-ink-400">
        {{ event.outcome === "accepted" ? t("chat.planAccepted") : t("chat.planRejected") }}
      </p>
    </div>

    <div v-else-if="event.type === 'runtime_error'" class="cx-panel cx-panel-warn p-2.5">
      <div class="flex items-start gap-2 text-[12.5px] leading-relaxed text-amber-100/90">
        <TriangleAlert class="mt-[2px] h-3.5 w-3.5 shrink-0" />
        <p class="min-w-0 flex-1">{{ event.message }}</p>
      </div>
      <div class="cx-chat-actions mt-2">
        <UiButton
          size="xs"
          variant="outline"
          :disabled="actionsLocked"
          :loading="isActing('fix-error')"
          @click="act('fix-error', { type: 'fix_error', eventId: event.id })"
        >{{ t("chat.fixThis") }}</UiButton>
      </div>
    </div>

    <div v-else-if="event.type === 'checkpoint'" class="cx-summary">
      <GitCommit class="h-3 w-3 shrink-0" />
      <span class="min-w-0 truncate">{{ t("chat.checkpoint") }} · {{ event.label }}</span>
      <UiButton
        size="xs"
        variant="ghost"
        class="ml-auto shrink-0"
        :disabled="actionsLocked"
        :loading="isActing('restore')"
        @click="act('restore', { type: 'restore_checkpoint', checkpointId: event.id })"
      >
        {{ t("chat.restore") }}
      </UiButton>
    </div>

    <div v-else-if="event.type === 'permission'" class="cx-panel p-3">
      <p class="inline-flex items-center gap-1.5 text-[11px] text-ink-400">
        <Shield class="h-3.5 w-3.5" /> {{ t("chat.permissionTitle") }}
      </p>
      <div class="markdown-body mt-1.5 text-ink-950" v-html="html" />
      <div v-if="event.outcome === 'pending'" class="cx-chat-actions mt-2.5">
        <UiButton
          size="xs"
          variant="outline"
          :disabled="actionsLocked"
          :loading="isActing('reject-once')"
          @click="act('reject-once', { type: 'decide_permission', outcome: 'reject-once' })"
        >{{ t("chat.rejectOnce") }}</UiButton>
        <UiButton
          size="xs"
          variant="soft"
          :disabled="actionsLocked"
          :loading="isActing('allow-once')"
          @click="act('allow-once', { type: 'decide_permission', outcome: 'allow-once' })"
        >{{ t("chat.allowOnce") }}</UiButton>
        <UiButton
          size="xs"
          :disabled="actionsLocked"
          :loading="isActing('allow-always')"
          @click="act('allow-always', { type: 'decide_permission', outcome: 'allow-always' })"
        >{{ t("chat.allowAlways") }}</UiButton>
      </div>
    </div>

    <p v-else-if="event.type === 'migration'" class="cx-summary">
      <Database class="h-3 w-3 shrink-0" />
      <span class="min-w-0">{{ t("chat.migrationBy", { author: event.author, name: event.name, branch: event.branch }) }}</span>
    </p>

    <p v-else-if="event.type === 'dropped_context'" class="cx-summary cx-warn">
      {{ t("chat.droppedContext", { count: event.omitted.length }) }}
    </p>
    <p v-else-if="event.type === 'budget'" class="cx-summary cx-warn">{{ t("chat.budget") }}</p>
    <p v-else-if="event.type === 'conflict'" class="cx-summary">{{ t("chat.conflict") }} · {{ event.message }}</p>
    <div v-else-if="event.type === 'proposal'" class="cx-summary">
      <span class="min-w-0 truncate">{{ t("chat.proposal") }} · {{ event.files.join(", ") }}</span>
      <UiButton
        size="xs"
        variant="ghost"
        class="ml-auto shrink-0"
        :disabled="actionsLocked"
        :loading="isActing('discard')"
        @click="act('discard', { type: 'discard_proposal' })"
      >
        {{ t("chat.discardProposal") }}
      </UiButton>
    </div>
    <p v-else-if="event.type === 'validation'" class="cx-summary">
      {{ t("chat.validation", { status: event.status }) }} · {{ event.command }}
    </p>
    <p v-else-if="event.type === 'run_failure'" class="cx-summary cx-warn">
      {{ event.kind === "provider_failover" ? t("chat.providerFailover") : t("chat.runFailure", { message: event.message }) }}
    </p>
    <p v-else-if="event.type === 'push'" class="cx-summary">
      {{ t("chat.pushStatus", { status: event.status }) }} · {{ event.message }}
    </p>
    <p v-else-if="event.type === 'run'" class="cx-summary">{{ t(`chat.run.${event.status}`) }}</p>
    <p v-else-if="event.type === 'prompt_manifest' && event.omitted.length" class="cx-summary">
      {{ t("chat.droppedContext", { count: event.omitted.length }) }}
    </p>
  </article>
</template>
