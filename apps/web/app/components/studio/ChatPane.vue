<script setup lang="ts">
import type { SessionEvent } from "@atelier/contracts";
import { ChevronDown } from "@lucide/vue";
import { assistantBlockText, assistantBlockVoice, groupChatBlocks, sessionEventKey, turnActionsEventId, type ChatBlock } from "~/utils/chat-events";
import { isChatNearBottom } from "~/utils/chat-scroll";

const props = defineProps<{
  events: SessionEvent[];
  sending: boolean;
  showWorking: boolean;
  workingSince: number | null;
  failedEventId: string;
  enterEventId: string;
  commandBusy?: boolean;
  hasAlert?: boolean;
  sessionId?: string;
}>();

const emit = defineEmits<{
  command: [payload: { type: string; [key: string]: unknown }];
  suggestion: [text: string];
  fork: [];
  retry: [];
}>();

const { t } = useI18n();
const scroller = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const pinnedToBottom = ref(true);
const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
let resizeObserver: ResizeObserver | undefined;

function syncPinnedFromScroll() {
  const el = scroller.value;
  if (!el) return;
  pinnedToBottom.value = isChatNearBottom(el);
}

function scrollToBottom() {
  const el = scroller.value;
  if (!el || !pinnedToBottom.value) return;
  el.scrollTop = el.scrollHeight;
}

async function stickToBottom() {
  if (!pinnedToBottom.value) return;
  await nextTick();
  if (!pinnedToBottom.value) return;
  scrollToBottom();
  requestAnimationFrame(() => {
    if (!pinnedToBottom.value) return;
    scrollToBottom();
  });
}

function jumpToLatest() {
  pinnedToBottom.value = true;
  void stickToBottom();
}

function observeContent(el: HTMLElement | null) {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  if (!el || typeof ResizeObserver === "undefined") return;
  resizeObserver = new ResizeObserver(() => {
    if (pinnedToBottom.value) scrollToBottom();
  });
  resizeObserver.observe(el);
}

watch(
  () => props.sessionId,
  () => {
    pinnedToBottom.value = true;
  },
);

watch(
  () => props.sending,
  (sending, wasSending) => {
    if (sending && !wasSending) pinnedToBottom.value = true;
  },
);

watch(
  () =>
    [
      props.sessionId,
      props.events.length,
      props.events.at(-1)?.id,
      props.events.at(-1)?.type,
      props.sending,
      props.showWorking,
      props.enterEventId,
    ] as const,
  () => {
    void stickToBottom();
  },
);

watch(content, (el) => observeContent(el), { flush: "post" });

watch(
  () => props.workingSince,
  (since) => {
    if (timer) clearInterval(timer);
    elapsed.value = 0;
    if (!since) return;
    const tick = () => {
      elapsed.value = Math.max(0, Math.floor((Date.now() - since) / 1000));
    };
    tick();
    timer = setInterval(tick, 250);
  },
  { immediate: true },
);

onMounted(() => {
  observeContent(content.value);
  void stickToBottom();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (timer) clearInterval(timer);
});

const suggestions = computed(() => [t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")]);
const workingLabel = computed(() =>
  elapsed.value > 0 ? t("chat.workingElapsed", { seconds: elapsed.value }) : t("chat.working"),
);
const blocks = computed(() => groupChatBlocks(props.events));
const actionEventId = computed(() => turnActionsEventId(props.events));
const showJumpToLatest = computed(() => !pinnedToBottom.value && props.events.length > 0);

function blockKey(block: ChatBlock) {
  if (block.type === "tools") return `tools:${block.events.map((event) => event.toolCallId).join(",")}`;
  if (block.type === "assistant") return `assistant:${block.events.map((event) => event.id).join(",")}`;
  return sessionEventKey(block.event);
}

function blockVoice(block: Extract<ChatBlock, { type: "assistant" }>) {
  return assistantBlockVoice(props.events, block);
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="relative min-h-0 flex-1">
      <div
        :key="sessionId ?? 'none'"
        ref="scroller"
        class="thin-scroll absolute inset-0 overflow-y-auto px-3 pb-3 pt-2"
        @scroll.passive="syncPinnedFromScroll"
      >
        <div ref="content" class="cx-chat-thread">
          <div v-if="hasAlert" class="sticky top-0 z-10 -mx-3 bg-canvas px-3 pb-0.5">
            <slot name="alert" />
          </div>
          <div v-if="!events.length" class="pt-2">
            <p class="text-[13px] text-ink-950">{{ t("chat.emptyTitle") }}</p>
            <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("chat.emptyHint") }}</p>
            <div class="mt-3 space-y-0.5">
              <button
                v-for="item in suggestions"
                :key="item"
                type="button"
                class="cx-menu-row h-auto min-h-[26px] py-1"
                @click="emit('suggestion', item)"
              >
                <ChevronDown class="h-3 w-3 shrink-0 -rotate-90 text-ink-400" />
                <span class="min-w-0 flex-1">{{ item }}</span>
              </button>
            </div>
          </div>

          <template v-for="block in blocks" :key="blockKey(block)">
            <div v-if="block.type === 'tools'" class="cx-tool-stack">
              <StudioEventCard
                v-for="event in block.events"
                :key="sessionEventKey(event)"
                :event="event"
                :enter="event.id === enterEventId"
                :failed="event.id === failedEventId"
                :command-busy="commandBusy"
                @command="emit('command', $event)"
                @reuse="emit('suggestion', $event)"
                @fork="emit('fork')"
                @retry="emit('retry')"
              />
            </div>
            <div
              v-else-if="block.type === 'assistant'"
              class="cx-assistant-stack"
              :data-voice="blockVoice(block)"
            >
              <StudioEventCard
                v-for="event in block.events"
                :key="sessionEventKey(event)"
                :event="event"
                :enter="event.id === enterEventId"
                :failed="event.id === failedEventId"
                :command-busy="commandBusy"
                :voice="blockVoice(block)"
                :show-actions="event.id === actionEventId"
                :copy-source="assistantBlockText(block.events)"
                @command="emit('command', $event)"
                @reuse="emit('suggestion', $event)"
                @fork="emit('fork')"
                @retry="emit('retry')"
              />
            </div>
            <StudioEventCard
              v-else
              :event="block.event"
              :enter="block.event.id === enterEventId"
              :failed="block.event.id === failedEventId"
              :command-busy="commandBusy"
              @command="emit('command', $event)"
              @reuse="emit('suggestion', $event)"
              @fork="emit('fork')"
              @retry="emit('retry')"
            />
          </template>

          <p v-if="showWorking" class="cx-working" aria-live="polite">
            <span class="cx-working-dots" aria-hidden="true"><i /><i /><i /></span>
            <span>{{ workingLabel }}</span>
          </p>
        </div>
      </div>
      <button
        v-if="showJumpToLatest"
        type="button"
        class="cx-jump-latest"
        @click="jumpToLatest"
      >
        <ChevronDown class="h-3 w-3 shrink-0" />
        {{ t("chat.jumpToLatest") }}
      </button>
    </div>

    <slot />
  </section>
</template>
