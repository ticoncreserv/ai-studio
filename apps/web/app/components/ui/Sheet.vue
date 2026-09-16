<script setup lang="ts">
defineProps<{ open: boolean; title: string }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40 bg-black/50" @click="$emit('close')" />
    <aside
      v-if="open"
      class="glass-window fixed inset-y-2 right-2 z-50 flex w-full max-w-md flex-col overflow-hidden shadow-float"
    >
      <header class="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-3.5">
        <h2 class="min-w-0 truncate text-[13px] font-medium">{{ title }}</h2>
        <UiIconButton size="sm" :label="title" @click="$emit('close')">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </UiIconButton>
      </header>
      <div class="thin-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="border-t border-line px-3.5 py-3">
        <slot name="footer" />
      </footer>
    </aside>
  </Teleport>
</template>
