<script setup lang="ts">
defineProps<{ open: boolean; title: string; wide?: boolean }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-md sm:p-8"
      @click.self="$emit('close')"
    >
      <div
        class="glass-window w-full overflow-hidden"
        :class="wide ? 'max-w-2xl' : 'max-w-lg'"
      >
        <header class="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 class="text-[15px] font-semibold tracking-tight">{{ title }}</h2>
          <button type="button" class="text-ink-300 hover:text-ink-800" @click="$emit('close')">✕</button>
        </header>
        <div class="px-5 py-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
