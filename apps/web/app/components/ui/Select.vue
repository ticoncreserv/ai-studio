<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";

export type UiSelectOption = { id: string; label: string; description?: string };

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    options: UiSelectOption[];
    placeholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
    allowEmpty?: boolean;
  }>(),
  { modelValue: "", options: () => [], allowEmpty: true },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const tray = ref<HTMLElement | null>(null);
const trayPos = ref({ top: "auto", left: "8px", width: "190px" });

const selected = computed(() => props.options.find((row) => row.id === props.modelValue));
const display = computed(() => selected.value?.label || props.placeholder || "");

function place() {
  if (!trigger.value) return;
  const box = trigger.value.getBoundingClientRect();
  const width = Math.max(box.width, 220);
  const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8);
  trayPos.value = {
    top: `${box.bottom + 6}px`,
    left: `${left}px`,
    width: `${width}px`,
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
  if (props.disabled) return;
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

function pick(id: string) {
  emit("update:modelValue", id);
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
  <div class="cx-select">
    <button
      ref="trigger"
      type="button"
      class="cx-select-trigger"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :aria-haspopup="true"
      :disabled="disabled"
      :data-open="open || undefined"
      :data-empty="selected ? undefined : true"
      @click.stop="toggle"
    >
      <span class="cx-select-value">{{ display }}</span>
      <ChevronDown class="cx-select-caret" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="tray"
        class="cx-menu locale-tray cx-select-tray thin-scroll"
        role="listbox"
        :aria-label="ariaLabel"
        :style="trayPos"
      >
        <button
          v-if="allowEmpty"
          type="button"
          role="option"
          class="cx-menu-row"
          :aria-selected="!modelValue"
          :data-active="!modelValue || undefined"
          @click="pick('')"
        >
          <span class="cx-menu-name">{{ placeholder }}</span>
        </button>
        <button
          v-for="item in options"
          :key="item.id"
          type="button"
          role="option"
          class="cx-menu-row"
          :aria-selected="modelValue === item.id"
          :data-active="modelValue === item.id || undefined"
          :title="item.description || item.id"
          @click="pick(item.id)"
        >
          <span class="cx-menu-name min-w-0 truncate">{{ item.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
