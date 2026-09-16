<script setup lang="ts">
import { Plus, Search } from "lucide-vue-next";
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
  <aside class="hidden h-full w-[220px] shrink-0 flex-col border-r border-line/80 bg-[#efe6d8] lg:flex">
    <div class="flex items-center gap-2 px-3 pt-3">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
        <input
          :value="query"
          :placeholder="t('nav.search')"
          class="h-8 w-full rounded-xl border border-line bg-paper/80 pl-8 pr-2 text-[12px] outline-none placeholder:text-ink-300 focus:border-coral-300"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
          @change="emit('search')"
        />
      </div>
      <UiIconButton :label="t('nav.newSession')" size="sm" @click="emit('create')">
        <Plus class="h-4 w-4" />
      </UiIconButton>
    </div>
    <p class="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-300">
      {{ t("workspace.sessionsTitle") }}
    </p>
    <div class="thin-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
      <p v-if="!sessions.length" class="px-2 py-6 text-center text-[12px] text-ink-400">{{ t("workspace.noSessions") }}</p>
      <button
        v-for="session in sessions"
        :key="session.id"
        type="button"
        class="w-full rounded-xl px-2.5 py-2 text-left transition"
        :class="session.id === activeId ? 'bg-paper shadow-lift' : 'hover:bg-paper/60'"
        @click="emit('select', session.id)"
      >
        <p class="truncate text-[13px] font-medium text-ink-800">{{ session.title || t("chat.untitled") }}</p>
        <p class="mt-0.5 truncate text-[11px] text-ink-300">{{ rel(session.createdAt) }} · {{ session.provider }}</p>
      </button>
    </div>
  </aside>
</template>
