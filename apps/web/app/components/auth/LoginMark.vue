<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span class="login-mark" :style="{ width: `${size ?? 72}px`, height: `${size ?? 72}px` }">
    <UiMark />
  </span>
</template>
