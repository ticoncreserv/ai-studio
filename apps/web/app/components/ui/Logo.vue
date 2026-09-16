<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-[9px] bg-gradient-to-br from-coral-400 to-coral-600 text-[#061018] shadow-glow"
    :style="{ width: `${size ?? 32}px`, height: `${size ?? 32}px` }"
  >
    <svg viewBox="0 0 24 24" class="h-[58%] w-[58%]" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" stroke="currentColor" stroke-width="1.8" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path d="M12 4.8v2.4M12 16.8v2.4M4.8 12h2.4M16.8 12h2.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  </span>
</template>
