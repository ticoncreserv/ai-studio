<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-[6px] border border-line bg-white/[0.05] text-coral-400"
    :style="{ width: `${size ?? 28}px`, height: `${size ?? 28}px` }"
  >
    <svg viewBox="0 0 24 24" class="h-[56%] w-[56%]" fill="none" aria-hidden="true">
      <path d="M12 3.2 20.2 7.8v8.4L12 20.8 3.8 16.2V7.8L12 3.2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M12 12.1 20.2 7.8M12 12.1v8.7M12 12.1 3.8 7.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.65" />
    </svg>
  </span>
</template>
