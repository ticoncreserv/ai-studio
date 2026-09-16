<script setup lang="ts">
import { Plus, Search } from "@lucide/vue";
import type { StudioSession } from "~/types/studio";

defineProps<{
  sessions: StudioSession[];
  activeId?: string;
  query: string;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  select: [id: string];
  create: [];
  search: [];
}>();

const { t } = useI18n();
const rel = useRelativeTime();
</script>

<template>
  <aside class="flex h-full min-h-0 w-full flex-col">
    <div class="flex items-center gap-2 px-3 pt-3">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
        <input
          :value="query"
          :placeholder="t('nav.search')"
          class="h-8 w-full rounded-[9px] border border-line bg-white/5 pl-8 pr-2 text-[12px] outline-none placeholder:text-ink-300 focus:border-coral-500/40"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
          @change="emit('search')"
        />
      </div>
      <UiIconButton :label="t('nav.newSession')" size="sm" @click="emit('create')">
        <Plus class="h-4 w-4" />
      </UiIconButton>
    </div>
    <div class="thin-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      <p v-if="!sessions.length" class="px-2 py-6 text-center text-[12px] text-ink-300">{{ t("workspace.noSessions") }}</p>
      <button
        v-for="session in sessions"
        :key="session.id"
        type="button"
        class="w-full rounded-[10px] px-2.5 py-2 text-left transition"
        :class="session.id === activeId ? 'bg-white/10 text-ink-950' : 'hover:bg-white/5'"
        @click="emit('select', session.id)"
      >
        <p class="truncate text-[13px] font-medium">{{ session.title || t("chat.untitled") }}</p>
        <p class="mt-0.5 truncate text-[11px] text-ink-300">{{ rel(session.createdAt) }} · {{ session.provider }}</p>
      </button>
    </div>
  </aside>
</template>
