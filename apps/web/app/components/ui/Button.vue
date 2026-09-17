<script setup lang="ts">
import { cn } from "~/utils/cn";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "ghost" | "outline" | "danger" | "soft";
    size?: "xs" | "sm" | "md" | "lg";
    type?: "button" | "submit";
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { variant: "primary", size: "md", type: "button" },
);

const isDisabled = computed(() => props.disabled || props.loading);
const spinnerSize = computed(() => (props.size === "xs" ? "xs" : "sm"));

const classes = computed(() =>
  cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap",
    "transition-colors duration-120 disabled:pointer-events-none",
    !props.loading && "disabled:opacity-40",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-coral-500/60",
    props.size === "xs" && "h-[22px] gap-1 rounded-[5px] px-2 text-[11px]",
    props.size === "sm" && "h-7 px-2.5 text-[12px]",
    props.size === "md" && "h-[30px] px-3 text-[13px]",
    props.size === "lg" && "h-9 px-4 text-[13px]",
    props.variant === "primary" && "bg-coral-500 text-on-accent hover:bg-coral-400",
    props.variant === "soft" && "bg-white/[0.06] text-ink-950 hover:bg-white/[0.1]",
    props.variant === "ghost" && "text-ink-600 hover:bg-white/[0.05] hover:text-ink-950",
    props.variant === "outline" && "border border-line bg-raised text-ink-800 hover:border-line-strong hover:text-ink-950",
    props.variant === "danger" && "border border-red-500/30 bg-red-500/12 text-red-300 hover:bg-red-500/20",
  ),
);
</script>

<template>
  <button :type="type" :disabled="isDisabled" :aria-busy="loading || undefined" :class="classes">
    <UiSpinner v-if="loading" :size="spinnerSize" />
    <slot />
  </button>
</template>
