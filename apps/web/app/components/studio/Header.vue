<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  Database,
  GitBranch,
  MoreHorizontal,
  PanelLeft,
  Settings2,
  Share2,
  UserPlus,
} from "@lucide/vue";

defineProps<{
  title: string;
  branch: string;
  statusLabel: string;
  statusTone: "live" | "warn" | "neutral";
  showStatus: boolean;
  login: string;
  presenceCount: number;
  presenceLabel: string;
  publishEnabled: boolean;
  platformAdmin?: boolean;
  railOpen: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
}>();

const emit = defineEmits<{
  invite: [];
  share: [];
  rules: [];
  connections: [];
  settings: [];
  signOut: [];
  shortcuts: [];
  "toggle-rail": [];
  prev: [];
  next: [];
}>();

const { t, locale, setLocale } = useI18n();
const menu = ref(false);
const trigger = ref<HTMLElement | null>(null);
const menuPos = ref({ top: 0, right: 12 });

function toggleMenu() {
  menu.value = !menu.value;
  if (!menu.value || !trigger.value) return;
  const box = trigger.value.getBoundingClientRect();
  menuPos.value = { top: box.bottom + 6, right: Math.max(12, window.innerWidth - box.right) };
}

function closeMenu() {
  menu.value = false;
}

function onDocumentPointer(event: PointerEvent) {
  if (!menu.value) return;
  const target = event.target as Node | null;
  if (trigger.value?.contains(target)) return;
  const panel = document.getElementById("atelier-more-menu");
  if (panel?.contains(target)) return;
  closeMenu();
}

onMounted(() => document.addEventListener("pointerdown", onDocumentPointer));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointer));
</script>

<template>
  <header class="relative z-40 flex shrink-0">
    <div v-if="railOpen" class="cx-titlebar hidden w-[215px] shrink-0 items-center border-r border-line bg-surface lg:flex">
      <span class="traffic" aria-hidden="true">
        <span class="tl-close" />
        <span class="tl-min" />
        <span class="tl-max" />
      </span>
      <UiIconButton :label="t('nav.toggleRail')" size="sm" class="ml-1" @click="emit('toggle-rail')">
        <PanelLeft class="h-3.5 w-3.5" />
      </UiIconButton>
      <div class="ml-auto flex items-center">
        <UiIconButton :label="t('nav.previousSession')" size="sm" :disabled="!canGoPrev" @click="emit('prev')">
          <ArrowLeft class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('nav.nextSession')" size="sm" :disabled="!canGoNext" @click="emit('next')">
          <ArrowRight class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
    </div>

    <div class="cx-titlebar flex min-w-0 flex-1 items-center">
      <span class="traffic" :class="railOpen ? 'cx-lights-compact' : 'flex'" aria-hidden="true">
        <span class="tl-close" />
        <span class="tl-min" />
        <span class="tl-max" />
      </span>
      <UiIconButton v-if="!railOpen" :label="t('nav.toggleRail')" size="sm" @click="emit('toggle-rail')">
        <PanelLeft class="h-3.5 w-3.5" />
      </UiIconButton>

      <p class="min-w-0 truncate text-[13px] text-ink-950" :title="`${title} · ${branch}`">{{ title }}</p>
      <GitBranch class="h-3 w-3 shrink-0 text-ink-400" :title="branch" />
      <UiBadge v-if="showStatus" :tone="statusTone">{{ statusLabel }}</UiBadge>

      <div class="ml-auto flex shrink-0 items-center gap-0.5">
        <div v-if="presenceCount > 1" class="mr-1 hidden md:flex" :title="presenceLabel">
          <UiAvatar :name="login" size="sm" />
        </div>
        <UiIconButton :label="t('nav.invite')" size="sm" @click="emit('invite')">
          <UserPlus class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('nav.share')" size="sm" @click="emit('share')">
          <Share2 class="h-3.5 w-3.5" />
        </UiIconButton>
        <div ref="trigger" class="relative">
          <UiIconButton :label="t('nav.more')" size="sm" :active="menu" @click="toggleMenu">
            <MoreHorizontal class="h-3.5 w-3.5" />
          </UiIconButton>
          <Teleport to="body">
            <div
              v-if="menu"
              id="atelier-more-menu"
              class="cx-menu fixed z-[80] w-56 p-1 shadow-float"
              :style="{ top: `${menuPos.top}px`, right: `${menuPos.right}px` }"
            >
              <button
                type="button"
                class="cx-menu-row"
                :disabled="!publishEnabled"
                :class="!publishEnabled && 'cursor-default opacity-45'"
                :title="publishEnabled ? t('nav.publish') : t('nav.publishSoon')"
              >
                <span class="cx-menu-name">{{ t("nav.publish") }}</span>
                <span v-if="!publishEnabled" class="cx-menu-desc ml-auto">{{ t("admin.comingSoon") }}</span>
              </button>
              <button type="button" class="cx-menu-row" @click="emit('connections'); closeMenu()">
                <Database class="h-3.5 w-3.5 shrink-0" />
                <span class="cx-menu-name">{{ t("nav.connections") }}</span>
              </button>
              <button type="button" class="cx-menu-row" @click="emit('shortcuts'); closeMenu()">
                <span class="cx-menu-name">{{ t("nav.shortcuts") }}</span>
                <UiKbd class="ml-auto">⌘/</UiKbd>
              </button>
              <NuxtLink v-if="platformAdmin" to="/admin" class="cx-menu-row" @click="closeMenu()">
                <Settings2 class="h-3.5 w-3.5 shrink-0" />
                <span class="cx-menu-name">{{ t("nav.admin") }}</span>
              </NuxtLink>
              <div class="cx-divider my-1" />
              <label class="cx-menu-row">
                <span>{{ t("settings.language") }}</span>
                <select
                  class="ml-auto rounded-[4px] border border-line bg-raised px-1.5 py-[1px] text-[11px] text-ink-800 outline-none"
                  :value="locale"
                  @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
                >
                  <option value="pt-BR">{{ t("auth.portuguese") }}</option>
                  <option value="en">{{ t("auth.english") }}</option>
                </select>
              </label>
              <button type="button" class="cx-menu-row" @click="emit('signOut'); closeMenu()">
                {{ t("nav.signOut") }}
              </button>
            </div>
          </Teleport>
        </div>
      </div>
    </div>
  </header>
</template>
