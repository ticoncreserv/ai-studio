<script setup lang="ts">
import { cn } from "~/utils/cn";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "ghost" | "outline" | "danger" | "soft";
    size?: "sm" | "md" | "lg";
    type?: "button" | "submit";
    disabled?: boolean;
  }>(),
  { variant: "primary", size: "md", type: "button" },
);

const classes = computed(() =>
  cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] font-medium",
    "transition-colors duration-120 disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-coral-500/60",
    props.size === "sm" && "h-7 px-2.5 text-[12px]",
    props.size === "md" && "h-[30px] px-3 text-[13px]",
    props.size === "lg" && "h-9 px-4 text-[13px]",
    props.variant === "primary" && "bg-coral-500 text-[#06101c] hover:bg-coral-400",
    props.variant === "soft" && "bg-white/[0.06] text-ink-950 hover:bg-white/[0.1]",
    props.variant === "ghost" && "text-ink-600 hover:bg-white/[0.05] hover:text-ink-950",
    props.variant === "outline" && "border border-line bg-raised text-ink-800 hover:border-line-strong hover:text-ink-950",
    props.variant === "danger" && "border border-red-500/30 bg-red-500/12 text-red-300 hover:bg-red-500/20",
  ),
);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
