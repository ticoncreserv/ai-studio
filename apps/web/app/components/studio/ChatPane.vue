<script setup lang="ts">
import type { SessionEvent } from "@atelier/contracts";
import { ChevronDown, Plus, Search } from "@lucide/vue";

const props = defineProps<{
  events: SessionEvent[];
  sending: boolean;
  spectator: boolean;
  spectatorEnabled: boolean;
  query: string;
  branch: string;
  runner: string;
}>();

const emit = defineEmits<{
  command: [payload: { type: string; [key: string]: unknown }];
  "update:query": [value: string];
  search: [];
  create: [];
  suggestion: [text: string];
  fork: [];
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
  <section class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex items-center gap-1.5 px-2 pb-1 lg:hidden">
      <div class="cx-search flex-1">
        <Search class="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <input
          :value="query"
          :placeholder="t('nav.searchSessions')"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
          @change="emit('search')"
        />
      </div>
      <UiIconButton :label="t('nav.newSession')" size="sm" @click="emit('create')">
        <Plus class="h-4 w-4" />
      </UiIconButton>
    </div>

    <div ref="scroller" class="thin-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3 pt-2">
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
        @command="emit('command', $event)"
        @reuse="emit('suggestion', $event)"
        @fork="emit('fork')"
      />

      <p v-if="sending" class="cx-summary">
        <UiSpinner size="sm" :label="t('chat.thinking')" />
        {{ t("chat.thinking") }}
      </p>
    </div>

    <slot />

    <div class="cx-footer shrink-0">
      <span class="inline-flex min-w-0 items-center gap-1">
        <span class="truncate" :title="branch">{{ branch }}</span>
      </span>
      <span class="hidden truncate sm:inline" :title="runner">{{ runner }}</span>
      <button
        v-if="spectatorEnabled"
        type="button"
        class="truncate hover:text-ink-700"
        @click="emit('toggle-spectator')"
      >
        {{ spectator ? t("workspace.watching") : t("workspace.editor") }}
      </button>
      <span class="ml-auto flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <UiSpinner v-if="sending" size="sm" :label="t('chat.thinking')" />
      </span>
    </div>
  </section>
</template>
