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
        'inline-flex items-center justify-center rounded-[9px] text-ink-500 transition duration-150',
        'hover:bg-white/10 hover:text-ink-950',
        props.size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        props.active && 'bg-white/15 text-ink-950 hover:bg-white/20 hover:text-ink-950',
      )
    "
  >
    <slot />
  </button>
</template>
