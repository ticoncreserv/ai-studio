<script setup lang="ts">
defineProps<{ tone?: "neutral" | "live" | "warn" | "info" }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] uppercase"
    :class="{
      'bg-white/5 text-ink-600': (tone ?? 'neutral') === 'neutral',
      'bg-emerald-400/10 text-emerald-300': tone === 'live',
      'bg-amber-400/10 text-amber-200': tone === 'warn',
      'bg-coral-50 text-coral-400': tone === 'info',
    }"
  >
    <span v-if="tone === 'live'" class="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
    <slot />
  </span>
</template>
