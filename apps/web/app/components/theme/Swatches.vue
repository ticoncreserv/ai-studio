<script setup lang="ts">
import { THEMES, type ThemeId } from "~/utils/theme";

const props = withDefaults(defineProps<{ placement?: "down" | "up" }>(), { placement: "down" });

const { t } = useI18n();
const { current, setTheme, themes } = useTheme();

const THEME_KEYS = {
  crimson: "theme.crimson",
  azure: "theme.azure",
  amber: "theme.amber",
  violet: "theme.violet",
  teal: "theme.teal",
  chalk: "theme.chalk",
} as const satisfies Record<ThemeId, string>;

const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const tray = ref<HTMLElement | null>(null);
const trayPos = ref({ top: "auto", bottom: "auto", left: "auto", right: "12px" });

function place() {
  if (!trigger.value) return;
  const box = trigger.value.getBoundingClientRect();
  if (props.placement === "up") {
    const width = tray.value?.offsetWidth ?? 168;
    const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8);
    trayPos.value = {
      top: "auto",
      bottom: `${window.innerHeight - box.top + 6}px`,
      left: `${left}px`,
      right: "auto",
    };
    return;
  }
  trayPos.value = {
    top: `${box.bottom + 6}px`,
    bottom: "auto",
    left: "auto",
    right: `${Math.max(12, window.innerWidth - box.right)}px`,
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

function pick(id: ThemeId) {
  setTheme(id);
  close();
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
  <div class="theme-picker">
    <button
      ref="trigger"
      type="button"
      class="theme-trigger"
      :aria-label="t('auth.themeLabel')"
      :aria-expanded="open"
      :aria-haspopup="true"
      :title="t(THEME_KEYS[current])"
      :data-open="open || undefined"
      @click.stop="toggle"
    >
      <span
        class="theme-trigger-well"
        :style="{ background: THEMES[current].swatch }"
        aria-hidden="true"
      />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="tray"
        class="theme-tray"
        data-theme-tray
        role="radiogroup"
        :data-placement="props.placement"
        :aria-label="t('auth.themeLabel')"
        :style="trayPos"
      >
        <button
          v-for="id in themes"
          :key="id"
          type="button"
          role="radio"
          class="theme-swatch"
          :aria-checked="current === id"
          :aria-label="t(THEME_KEYS[id])"
          :title="t(THEME_KEYS[id])"
          :style="{ background: THEMES[id].swatch, color: THEMES[id].swatch }"
          @click="pick(id)"
        />
      </div>
    </Teleport>
  </div>
</template>
