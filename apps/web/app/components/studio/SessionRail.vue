<script setup lang="ts">
import { BookOpen, Database, MessageSquarePlus, PanelLeft, Plug, Search, SlidersHorizontal, Sparkles } from "@lucide/vue";
import type { StudioSession } from "~/types/studio";

const props = defineProps<{
  sessions: StudioSession[];
  activeId?: string;
  query: string;
  login: string;
  platformAdmin?: boolean;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  select: [id: string];
  create: [];
  search: [];
  rules: [];
  skills: [];
  mcp: [];
  connections: [];
  settings: [];
  close: [];
}>();

const { t } = useI18n();

const searchOpen = ref(false);
const expanded = ref(false);
const searchField = ref<HTMLInputElement | null>(null);
const collapsedCount = 12;

const visible = computed(() =>
  expanded.value ? props.sessions : props.sessions.slice(0, collapsedCount),
);
const hasMore = computed(() => !expanded.value && props.sessions.length > collapsedCount);

async function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) {
    if (props.query) {
      emit("update:query", "");
      emit("search");
    }
    return;
  }
  await nextTick();
  searchField.value?.focus();
}

/* Cursor shows a coarse age ("1h", "2d") rather than a full phrase. */
function age(at: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
  if (minutes < 60) return t("time.shortMinutes", { count: minutes });
  if (minutes < 60 * 24) return t("time.shortHours", { count: Math.floor(minutes / 60) });
  return t("time.shortDays", { count: Math.floor(minutes / (60 * 24)) });
}
</script>

<template>
  <aside id="studio-session-rail" class="studio-session-rail cx-rail min-h-0 overflow-hidden">
    <div class="cx-titlebar flex shrink-0 items-center">
      <span class="app-brand">
        <UiLogo :size="24" />
        <span class="app-wordmark">{{ t("app.wordmark") }}</span>
      </span>
      <UiIconButton
        class="ml-auto"
        :label="t('nav.toggleRail')"
        size="sm"
        @click="emit('close')"
      >
        <PanelLeft class="h-3.5 w-3.5" />
      </UiIconButton>
    </div>
    <div class="px-2 pt-1.5">
      <button type="button" class="cx-nav-item" @click="emit('create')">
        <MessageSquarePlus class="h-3.5 w-3.5" />
        {{ t("nav.newSession") }}
      </button>
      <button type="button" class="cx-nav-item" @click="emit('rules')">
        <BookOpen class="h-3.5 w-3.5" />
        {{ t("nav.rules") }}
      </button>
      <button type="button" class="cx-nav-item" @click="emit('skills')">
        <Sparkles class="h-3.5 w-3.5" />
        {{ t("nav.skills") }}
      </button>
      <button type="button" class="cx-nav-item" @click="emit('mcp')">
        <Plug class="h-3.5 w-3.5" />
        {{ t("nav.mcp") }}
      </button>
      <button type="button" class="cx-nav-item" @click="emit('connections')">
        <Database class="h-3.5 w-3.5" />
        {{ t("nav.connections") }}
      </button>
      <button type="button" class="cx-nav-item" @click="emit('settings')">
        <SlidersHorizontal class="h-3.5 w-3.5" />
        {{ t("nav.settings") }}
      </button>
    </div>

    <div class="cx-nav-group cx-rail-group">
      <p id="studio-sessions-label" class="cx-rail-group-label">{{ t("nav.sessions") }}</p>
      <UiIconButton :label="t('nav.search')" size="sm" :active="searchOpen" @click="toggleSearch">
        <Search class="h-3.5 w-3.5" />
      </UiIconButton>
    </div>

    <div v-if="searchOpen" class="cx-search mx-2 mb-1">
      <Search class="h-3.5 w-3.5 shrink-0 text-ink-400" />
      <input
        ref="searchField"
        :value="query"
        :placeholder="t('nav.searchSessions')"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        @change="emit('search')"
        @keydown.enter.prevent="emit('search')"
      />
    </div>

    <div class="cx-session-list thin-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-labelledby="studio-sessions-label">
      <p v-if="!sessions.length" class="px-2 py-3 text-[12px] text-ink-400">{{ t("workspace.noSessions") }}</p>
      <button
        v-for="session in visible"
        :key="session.id"
        type="button"
        class="cx-session-row"
        :data-active="session.id === activeId || undefined"
        :title="session.title || t('chat.untitled')"
        @click="emit('select', session.id)"
      >
        <span class="cx-session-dot" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ session.title || t("chat.untitled") }}</span>
        <span class="cx-age">{{ age(session.createdAt) }}</span>
      </button>
      <button v-if="hasMore" type="button" class="cx-session-row cx-session-row-sub cx-muted" @click="expanded = true">
        {{ t("nav.more") }}
      </button>
    </div>

    <StudioRailAccount :login="login" :platform-admin="platformAdmin" />
  </aside>
</template>
