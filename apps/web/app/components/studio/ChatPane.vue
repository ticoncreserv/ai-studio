<script setup lang="ts">
import type { SessionEvent } from "@atelier/contracts";
import { Eye, Plus, Search } from "@lucide/vue";

const props = defineProps<{
  events: SessionEvent[];
  sending: boolean;
  spectator: boolean;
  spectatorEnabled: boolean;
  query: string;
}>();

const emit = defineEmits<{
  command: [payload: { type: string; [key: string]: unknown }];
  "update:query": [value: string];
  search: [];
  create: [];
  suggestion: [text: string];
  "toggle-spectator": [];
}>();

const { t } = useI18n();
const scroller = ref<HTMLElement | null>(null);

watch(
  () => props.events.length,
  async () => {
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  },
);

const suggestions = computed(() => [t("chat.suggestion1"), t("chat.suggestion2"), t("chat.suggestion3")]);
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
    <div class="flex items-center gap-2 border-b border-line/70 px-3 py-2 lg:hidden">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
        <input
          :value="query"
          :placeholder="t('nav.search')"
          class="h-8 w-full rounded-xl border border-line bg-canvas/70 pl-8 pr-2 text-[12px] outline-none"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
          @change="emit('search')"
        />
      </div>
      <UiIconButton :label="t('nav.newSession')" size="sm" @click="emit('create')">
        <Plus class="h-4 w-4" />
      </UiIconButton>
    </div>

    <div class="flex items-center justify-between px-4 pt-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-300">{{ t("workspace.openChat") }}</p>
      <button
        v-if="spectatorEnabled"
        type="button"
        class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        :class="spectator ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-ink-600'"
        @click="emit('toggle-spectator')"
      >
        <Eye class="h-3 w-3" />
        {{ spectator ? t("workspace.watching") : t("workspace.editor") }}
      </button>
    </div>

    <div ref="scroller" class="thin-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      <div v-if="!events.length" class="rounded-2xl border border-dashed border-line bg-canvas/50 px-5 py-8">
        <p class="font-display text-3xl leading-none text-ink-950">{{ t("chat.emptyTitle") }}</p>
        <p class="mt-3 text-sm leading-relaxed text-ink-500">{{ t("chat.emptyHint") }}</p>
        <div class="mt-5 flex flex-col gap-2">
          <button
            v-for="item in suggestions"
            :key="item"
            type="button"
            class="rounded-xl border border-line bg-paper px-3 py-2 text-left text-[13px] text-ink-700 hover:border-coral-300"
            @click="emit('suggestion', item)"
          >
            {{ item }}
          </button>
        </div>
      </div>

      <StudioEventCard
        v-for="event in events"
        :key="event.id + event.type"
        :event="event"
        @command="emit('command', $event)"
      />

      <p v-if="sending" class="text-[12px] text-ink-300">{{ t("chat.thinking") }}</p>
    </div>

    <slot />
  </section>
</template>
