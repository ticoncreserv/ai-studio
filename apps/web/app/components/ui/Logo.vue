<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span class="ui-logo" :style="{ width: `${size ?? 22}px`, height: `${size ?? 22}px` }">
    <UiMark />
  </span>
</template>
