<script setup lang="ts">
defineProps<{ open: boolean; title: string }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40 bg-black/55 backdrop-blur-md" @click="$emit('close')" />
    <aside
      v-if="open"
      class="glass-window fixed inset-y-3 right-3 z-50 flex w-full max-w-md flex-col overflow-hidden"
    >
      <header class="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 class="text-[15px] font-semibold tracking-tight">{{ title }}</h2>
        <UiIconButton :label="title" @click="$emit('close')">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </UiIconButton>
      </header>
      <div class="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="border-t border-line px-5 py-4">
        <slot name="footer" />
      </footer>
    </aside>
  </Teleport>
</template>
