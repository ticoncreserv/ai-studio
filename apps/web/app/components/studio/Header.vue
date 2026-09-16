<script setup lang="ts">
import { BookOpen, Database, GitBranch, MoreHorizontal, Share2, SlidersHorizontal, UserPlus } from "lucide-vue-next";

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
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-3 border-b border-line/80 bg-paper/85 px-3 backdrop-blur-xl sm:px-4">
    <NuxtLink to="/" class="flex items-center gap-2.5">
      <UiLogo :size="28" />
      <span class="hidden text-sm font-semibold tracking-tight sm:block">{{ t("app.name") }}</span>
    </NuxtLink>
    <span class="hidden h-4 w-px bg-line sm:block" />
    <div class="min-w-0">
      <p class="truncate text-[13px] font-medium text-ink-800">{{ project }}</p>
      <p class="hidden items-center gap-1 font-mono text-[11px] text-ink-300 sm:flex">
        <GitBranch class="h-3 w-3" />
        {{ branch }}
      </p>
    </div>
    <UiBadge :tone="statusTone">{{ statusLabel }}</UiBadge>
    <div class="ml-auto flex items-center gap-1.5">
      <div class="hidden items-center -space-x-1.5 md:flex" :title="presenceLabel">
        <UiAvatar :name="login" size="sm" class="ring-2 ring-paper" />
        <span v-if="presenceCount > 1" class="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink-100 px-1 text-[10px] font-semibold text-ink-600 ring-2 ring-paper">
          +{{ presenceCount - 1 }}
        </span>
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
      <UiButton size="sm" variant="soft" @click="emit('share')">
        <Share2 class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">{{ t("nav.share") }}</span>
      </UiButton>
      <div class="relative">
        <UiIconButton :label="t('nav.more')" @click="menu = !menu">
          <MoreHorizontal class="h-4 w-4" />
        </UiIconButton>
        <div v-if="menu" class="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-2xl border border-line bg-paper py-1 shadow-float">
          <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-canvas" @click="emit('rules'); menu = false">
            <BookOpen class="h-3.5 w-3.5" /> {{ t("nav.rules") }}
          </button>
          <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-canvas" @click="emit('connections'); menu = false">
            <Database class="h-3.5 w-3.5" /> {{ t("nav.connections") }}
          </button>
          <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-canvas" @click="emit('settings'); menu = false">
            <SlidersHorizontal class="h-3.5 w-3.5" /> {{ t("nav.settings") }}
          </button>
          <label class="flex items-center justify-between px-3 py-2 text-[13px]">
            <span>{{ t("settings.language") }}</span>
            <select
              class="rounded-lg border border-line bg-white px-2 py-1 text-xs"
              :value="locale"
              @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
            >
              <option value="en">{{ t("auth.english") }}</option>
              <option value="pt-BR">{{ t("auth.portuguese") }}</option>
            </select>
          </label>
          <button class="flex w-full px-3 py-2 text-left text-[13px] text-ink-600 hover:bg-canvas" @click="emit('signOut'); menu = false">
            {{ t("nav.signOut") }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
