<script setup lang="ts">
defineProps<{ name: string; size?: "sm" | "md" }>();
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] font-medium text-ink-700"
    :class="size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]'"
  >
    {{ (name || "?").slice(0, 1).toUpperCase() }}
  </span>
</template>
