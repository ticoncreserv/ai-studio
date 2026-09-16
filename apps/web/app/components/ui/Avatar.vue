<script setup lang="ts">
defineProps<{ name: string; size?: "sm" | "md" }>();
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-full bg-coral-500 font-semibold text-[#061018]"
    :class="size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-[11px]'"
  >
    {{ (name || "?").slice(0, 1).toUpperCase() }}
  </span>
</template>
