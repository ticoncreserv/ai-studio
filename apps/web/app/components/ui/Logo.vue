<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-[13px] bg-coral-500 text-white shadow-glow"
    :style="{ width: `${size ?? 32}px`, height: `${size ?? 32}px` }"
  >
    <svg viewBox="0 0 24 24" class="h-[58%] w-[58%]" fill="none" aria-hidden="true">
      <path
        d="M6.2 17.6 12 5.8l5.8 11.8"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M8.6 13.2h6.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  </span>
</template>
