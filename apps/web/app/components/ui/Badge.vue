<script setup lang="ts">
defineProps<{ tone?: "neutral" | "live" | "warn" }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide"
    :class="{
      'bg-ink-100 text-ink-600': (tone ?? 'neutral') === 'neutral',
      'bg-emerald-50 text-emerald-700': tone === 'live',
      'bg-amber-50 text-amber-700': tone === 'warn',
    }"
  >
    <span
      v-if="tone === 'live'"
      class="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500"
    />
    <slot />
  </span>
</template>
