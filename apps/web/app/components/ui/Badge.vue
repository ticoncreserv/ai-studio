<script setup lang="ts">
defineProps<{ tone?: "neutral" | "live" | "warn" | "info" }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-[2px] text-[10px] font-medium tracking-[0.03em] uppercase"
    :class="{
      'bg-white/[0.06] text-ink-500': (tone ?? 'neutral') === 'neutral',
      'bg-emerald-500/12 text-emerald-300/90': tone === 'live',
      'bg-amber-400/12 text-amber-200/90': tone === 'warn',
      'bg-coral-50 text-coral-300': tone === 'info',
    }"
  >
    <span v-if="tone === 'live'" class="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
    <slot />
  </span>
</template>
