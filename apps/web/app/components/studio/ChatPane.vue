<script setup lang="ts">
import type { SessionEvent } from "@atelier/contracts";
import { ChevronDown } from "@lucide/vue";

const props = defineProps<{
  events: SessionEvent[];
  sending: boolean;
  showWorking: boolean;
  workingSince: number | null;
  failedEventId: string;
  enterEventId: string;
  commandBusy?: boolean;
  hasAlert?: boolean;
}>();

const emit = defineEmits<{
  command: [payload: { type: string; [key: string]: unknown }];
  suggestion: [text: string];
  fork: [];
  retry: [];
}>();

const { t } = useI18n();
const scroller = ref<HTMLElement | null>(null);
const bottom = ref<HTMLElement | null>(null);
const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

function scrollToBottom(behavior: ScrollBehavior = "auto") {
  const el = scroller.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  bottom.value?.scrollIntoView({ block: "end", behavior });
}

async function stickToBottom(behavior: ScrollBehavior = "auto") {
  await nextTick();
  scrollToBottom(behavior);
  requestAnimationFrame(() => scrollToBottom(behavior));
}

watch(
  () =>
    [
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
  void stickToBottom();
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const suggestions = computed(() => [t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")]);
const workingLabel = computed(() =>
  elapsed.value > 0 ? t("chat.workingElapsed", { seconds: elapsed.value }) : t("chat.working"),
);
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div ref="scroller" class="thin-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3 pt-2">
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

      <StudioEventCard
        v-for="event in events"
        :key="event.id + event.type"
        :event="event"
        :enter="event.id === enterEventId"
        :failed="event.id === failedEventId"
        :command-busy="commandBusy"
        @command="emit('command', $event)"
        @reuse="emit('suggestion', $event)"
        @fork="emit('fork')"
        @retry="emit('retry')"
      />

      <p v-if="showWorking" class="cx-working" aria-live="polite">
        <span class="cx-working-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{{ workingLabel }}</span>
      </p>
      <div ref="bottom" class="h-px w-full shrink-0" aria-hidden="true" />
    </div>

    <slot />
  </section>
</template>
