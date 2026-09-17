<script setup lang="ts">
import { Keyboard, LogOut, Settings2 } from "@lucide/vue";
import { STUDIO_SHORTCUTS } from "~/utils/studio-shortcuts";
import { THEMES, type ThemeId } from "~/utils/theme";

type LocaleId = "pt-BR" | "en";

const { t, locale, setLocale } = useI18n();
const { current: theme, setTheme, themes } = useTheme();
const { leaving, signOut } = useSignOut();

const THEME_KEYS = {
  crimson: "theme.crimson",
  azure: "theme.azure",
  amber: "theme.amber",
  violet: "theme.violet",
  teal: "theme.teal",
  chalk: "theme.chalk",
} as const satisfies Record<ThemeId, string>;

const LOCALE_CODES: Record<LocaleId, "BR" | "US"> = {
  "pt-BR": "BR",
  en: "US",
};

const localeOptions = computed(() => [
  { id: "pt-BR" as const, code: LOCALE_CODES["pt-BR"], label: t("auth.portuguese") },
  { id: "en" as const, code: LOCALE_CODES.en, label: t("auth.english") },
]);

const currentLocale = computed<LocaleId>(() => (locale.value === "en" ? "en" : "pt-BR"));

const open = ref(false);
const shortcutsOpen = ref(false);
const trigger = ref<HTMLElement | null>(null);
const tray = ref<HTMLElement | null>(null);
const trayPos = ref({ top: "auto", bottom: "auto", left: "8px", right: "auto" });

function place() {
  if (!trigger.value) return;
  const box = trigger.value.getBoundingClientRect();
  const width = tray.value?.offsetWidth ?? 220;
  const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8);
  trayPos.value = {
    top: "auto",
    bottom: `${window.innerHeight - box.top + 6}px`,
    left: `${left}px`,
    right: "auto",
  };
}

function bindOutside() {
  document.addEventListener("pointerdown", onDocumentPointer);
  document.addEventListener("keydown", onKey);
}

function unbindOutside() {
  document.removeEventListener("pointerdown", onDocumentPointer);
  document.removeEventListener("keydown", onKey);
}

function close() {
  if (!open.value) return;
  open.value = false;
  unbindOutside();
}

function toggle() {
  if (open.value) {
    close();
    return;
  }
  place();
  open.value = true;
  void nextTick(() => {
    place();
    bindOutside();
  });
}

function pickLocale(id: LocaleId) {
  void setLocale(id);
}

function pickTheme(id: ThemeId) {
  setTheme(id);
}

function openShortcuts() {
  close();
  shortcutsOpen.value = true;
}

async function onSignOut() {
  close();
  await signOut();
}

function onDocumentPointer(event: PointerEvent) {
  const target = event.target as Node | null;
  if (trigger.value?.contains(target)) return;
  if (tray.value?.contains(target)) return;
  close();
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

onBeforeUnmount(unbindOutside);
</script>

<template>
  <div class="cx-account-menu">
    <div ref="trigger">
      <UiIconButton
        size="sm"
        :label="t('nav.accountSettings')"
        :active="open"
        aria-haspopup="true"
        :aria-expanded="open"
        @click.stop="toggle"
      >
        <Settings2 class="h-3.5 w-3.5" />
      </UiIconButton>
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        ref="tray"
        id="atelier-account-menu"
        class="cx-menu cx-account-tray"
        role="menu"
        :aria-label="t('nav.accountSettings')"
        :style="trayPos"
      >
        <p class="cx-account-tray-label">{{ t("settings.language") }}</p>
        <button
          v-for="item in localeOptions"
          :key="item.id"
          type="button"
          role="menuitemradio"
          class="cx-menu-row"
          :aria-checked="currentLocale === item.id"
          :data-active="currentLocale === item.id || undefined"
          @click="pickLocale(item.id)"
        >
          <span class="locale-code text-ink-600" aria-hidden="true">{{ item.code }}</span>
          <span class="cx-menu-name">{{ item.label }}</span>
        </button>

        <p class="cx-account-tray-label">{{ t("settings.theme") }}</p>
        <div class="cx-account-swatches" role="radiogroup" :aria-label="t('auth.themeLabel')">
          <button
            v-for="id in themes"
            :key="id"
            type="button"
            role="radio"
            class="theme-swatch"
            :aria-checked="theme === id"
            :aria-label="t(THEME_KEYS[id])"
            :title="t(THEME_KEYS[id])"
            :style="{ background: THEMES[id].swatch, color: THEMES[id].swatch }"
            @click="pickTheme(id)"
          />
        </div>

        <div class="cx-divider my-1" />
        <button type="button" role="menuitem" class="cx-menu-row" @click="openShortcuts">
          <Keyboard class="h-3.5 w-3.5 shrink-0" />
          <span class="cx-menu-name">{{ t("nav.shortcuts") }}</span>
          <UiKbd class="ml-auto">⌘/</UiKbd>
        </button>
        <button type="button" role="menuitem" class="cx-menu-row" :disabled="leaving" @click="onSignOut">
          <LogOut class="h-3.5 w-3.5 shrink-0" />
          <span class="cx-menu-name">{{ t("nav.signOut") }}</span>
        </button>
      </div>
    </Teleport>

    <UiDialog :open="shortcutsOpen" :title="t('nav.shortcuts')" @close="shortcutsOpen = false">
      <ul class="space-y-2">
        <li v-for="row in STUDIO_SHORTCUTS" :key="row.id" class="flex items-center justify-between text-sm">
          <span>{{ t(row.labelKey) }}</span>
          <UiKbd>{{ row.keys }}</UiKbd>
        </li>
      </ul>
    </UiDialog>
  </div>
</template>
