<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <section class="glass-window flex min-h-0 flex-col overflow-hidden">
    <header class="window-titlebar shrink-0">
      <span class="traffic" aria-hidden="true">
        <span class="tl-close" />
        <span class="tl-min" />
        <span class="tl-max" />
      </span>
      <p v-if="title" class="min-w-0 truncate text-[12px] font-medium text-ink-500">{{ title }}</p>
      <div class="ml-auto flex items-center gap-1">
        <slot name="actions" />
      </div>
    </header>
    <div class="flex min-h-0 flex-1 flex-col">
      <slot />
    </div>
  </section>
</template>
