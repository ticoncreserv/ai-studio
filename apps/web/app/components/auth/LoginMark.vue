<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span class="login-mark" :style="{ width: `${size ?? 72}px`, height: `${size ?? 72}px` }">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.2 20.2 7.8v8.4L12 20.8 3.8 16.2V7.8L12 3.2Z"
        stroke="currentColor"
        stroke-width="1.15"
        stroke-linejoin="round"
      />
      <path
        d="M12 12.1 20.2 7.8M12 12.1v8.7M12 12.1 3.8 7.8"
        stroke="currentColor"
        stroke-width="0.95"
        stroke-linecap="round"
        opacity="0.55"
      />
    </svg>
  </span>
</template>
