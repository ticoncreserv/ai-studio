<script setup lang="ts">
const props = defineProps<{ open: boolean; title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
const previouslyFocused = ref<HTMLElement | null>(null);

function focusableElements() {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.getClientRects().length > 0);
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key !== "Tab") return;
  const items = focusableElements();
  if (!items.length) {
    event.preventDefault();
    panel.value?.focus();
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey) {
    if (!active || active === first || !panel.value?.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (!active || active === last || !panel.value?.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previouslyFocused.value = document.activeElement as HTMLElement | null;
      window.addEventListener("keydown", onKeydown);
      nextTick(() => {
        const preferred = panel.value?.querySelector<HTMLElement>("[data-autofocus]");
        (preferred ?? focusableElements()[0] ?? panel.value)?.focus();
      });
      return;
    }
    window.removeEventListener("keydown", onKeydown);
    previouslyFocused.value?.focus?.();
    previouslyFocused.value = null;
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[8vh] backdrop-blur-md sm:p-8 sm:pt-[12vh]"
      @click.self="$emit('close')"
    >
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        class="glass-window w-full max-h-[min(80vh,40rem)] overflow-hidden outline-none"
        :class="wide ? 'max-w-2xl' : 'max-w-lg'"
      >
        <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 class="min-w-0 text-[15px] font-semibold tracking-tight break-all">{{ title }}</h2>
          <button type="button" class="shrink-0 text-ink-300 hover:text-ink-800" :aria-label="title" @click="$emit('close')">✕</button>
        </header>
        <div class="max-h-[min(60vh,28rem)] overflow-y-auto px-5 py-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
