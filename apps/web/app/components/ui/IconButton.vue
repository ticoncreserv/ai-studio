<script setup lang="ts">
import { cn } from "~/utils/cn";

const props = withDefaults(
  defineProps<{
    label: string;
    active?: boolean;
    size?: "sm" | "md";
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { size: "md" },
);

const isDisabled = computed(() => props.disabled || props.loading);
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    :class="
      cn(
        'inline-flex shrink-0 items-center justify-center rounded-[6px] text-ink-500 transition-colors duration-120',
        'hover:bg-white/[0.06] hover:text-ink-950 disabled:pointer-events-none',
        !props.loading && 'disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-coral-500/60',
        props.size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
        props.active && 'bg-white/[0.1] text-ink-950',
      )
    "
  >
    <UiSpinner v-if="loading" size="xs" />
    <slot v-else />
  </button>
</template>
