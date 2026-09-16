<script setup lang="ts">
import { cn } from "~/utils/cn";

const props = withDefaults(
  defineProps<{
    label: string;
    active?: boolean;
    size?: "sm" | "md";
  }>(),
  { size: "md" },
);
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :class="
      cn(
        'inline-flex items-center justify-center rounded-full text-ink-600 transition duration-150',
        'hover:bg-ink-100 hover:text-ink-950',
        props.size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        props.active && 'bg-ink-950 text-white hover:bg-ink-800 hover:text-white',
      )
    "
  >
    <slot />
  </button>
</template>
