<script setup lang="ts">
defineProps<{ tone?: "neutral" | "live" | "warn" }>();
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide"
    :class="{
      'border-ink-700 text-ink-500': (tone ?? 'neutral') === 'neutral',
      'border-emerald-700 text-emerald-300': tone === 'live',
      'border-amber-700 text-amber-300': tone === 'warn',
    }"
  >
    <slot />
  </span>
</template>
