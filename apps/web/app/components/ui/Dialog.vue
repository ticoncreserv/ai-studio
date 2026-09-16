<script setup lang="ts">
defineProps<{ open: boolean; title: string; wide?: boolean }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/35 p-4 pt-[12vh] backdrop-blur-sm sm:p-8"
      @click.self="$emit('close')"
    >
      <div
        class="w-full overflow-hidden rounded-2xl border border-line bg-paper shadow-float"
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
