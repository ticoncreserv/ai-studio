<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: "sm" | "md" | "lg";
    label?: string;
  }>(),
  { size: "md" },
);
</script>

<template>
  <span
    class="atelier-spinner"
    :class="size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'"
    :aria-label="label"
    :aria-hidden="label ? undefined : true"
    role="status"
  />
</template>
