<script setup lang="ts">
import { BookOpen, Database, GitBranch, MoreHorizontal, Settings2, Share2, SlidersHorizontal, UserPlus } from "@lucide/vue";

defineProps<{
  project: string;
  branch: string;
  status: string;
  statusLabel: string;
  statusTone: "live" | "warn" | "neutral";
  login: string;
  presenceCount: number;
  presenceLabel: string;
  publishEnabled: boolean;
  platformAdmin?: boolean;
}>();

const emit = defineEmits<{
  invite: [];
  share: [];
  rules: [];
  connections: [];
  settings: [];
  signOut: [];
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
  <header class="menubar relative z-40 flex h-11 shrink-0 items-center gap-3 px-3 sm:px-4">
    <span class="traffic hidden sm:flex" aria-hidden="true">
      <span class="tl-close" />
      <span class="tl-min" />
      <span class="tl-max" />
    </span>
    <NuxtLink to="/" class="flex items-center gap-2">
      <UiLogo :size="22" />
      <span class="text-[13px] font-semibold tracking-tight">{{ t("app.name") }}</span>
    </NuxtLink>
    <span class="hidden h-3 w-px bg-white/10 sm:block" />
    <div class="min-w-0">
      <p class="truncate text-[12px] font-medium text-ink-800">{{ project }}</p>
    </div>
    <span class="hidden items-center gap-1 font-mono text-[10px] text-ink-300 lg:inline-flex">
      <GitBranch class="h-3 w-3" />
      {{ branch }}
    </span>
    <UiBadge :tone="statusTone">{{ statusLabel }}</UiBadge>
    <div class="ml-auto flex items-center gap-1">
      <div class="hidden items-center -space-x-1.5 md:flex" :title="presenceLabel">
        <UiAvatar :name="login" size="sm" />
      </div>
      <UiButton
        size="sm"
        :variant="publishEnabled ? 'primary' : 'outline'"
        :disabled="!publishEnabled"
        :title="publishEnabled ? t('nav.publish') : t('nav.publishSoon')"
      >
        {{ t("nav.publish") }}
      </UiButton>
      <UiIconButton :label="t('nav.invite')" @click="emit('invite')">
        <UserPlus class="h-4 w-4" />
      </UiIconButton>
      <UiIconButton :label="t('nav.share')" @click="emit('share')">
        <Share2 class="h-4 w-4" />
      </UiIconButton>
      <UiIconButton :label="t('nav.rules')" @click="emit('rules')">
        <BookOpen class="h-4 w-4" />
      </UiIconButton>
      <UiIconButton :label="t('nav.settings')" @click="emit('settings')">
        <SlidersHorizontal class="h-4 w-4" />
      </UiIconButton>
      <div ref="trigger" class="relative">
        <UiIconButton :label="t('nav.more')" :active="menu" @click="toggleMenu">
          <MoreHorizontal class="h-4 w-4" />
        </UiIconButton>
        <Teleport to="body">
          <div
            v-if="menu"
            id="atelier-more-menu"
            class="glass-window fixed z-[80] w-56 overflow-hidden py-1 shadow-float"
            :style="{ top: `${menuPos.top}px`, right: `${menuPos.right}px` }"
          >
            <NuxtLink
              v-if="platformAdmin"
              to="/admin"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-white/5"
              @click="closeMenu()"
            >
              <Settings2 class="h-3.5 w-3.5" /> {{ t("nav.admin") }}
            </NuxtLink>
            <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-white/5" @click="emit('connections'); closeMenu()">
              <Database class="h-3.5 w-3.5" /> {{ t("nav.connections") }}
            </button>
            <label class="flex items-center justify-between px-3 py-2 text-[13px]">
              <span>{{ t("settings.language") }}</span>
              <select
                class="rounded-md border border-line bg-paper px-2 py-1 text-xs"
                :value="locale"
                @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
              >
                <option value="pt-BR">{{ t("auth.portuguese") }}</option>
                <option value="en">{{ t("auth.english") }}</option>
              </select>
            </label>
            <button class="flex w-full px-3 py-2 text-left text-[13px] text-ink-600 hover:bg-white/5" @click="emit('signOut'); closeMenu()">
              {{ t("nav.signOut") }}
            </button>
          </div>
        </Teleport>
      </div>
    </div>
  </header>
</template>
