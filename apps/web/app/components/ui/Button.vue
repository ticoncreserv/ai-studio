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
    "inline-flex items-center justify-center gap-2 font-medium tracking-tight transition duration-200",
    "disabled:pointer-events-none disabled:opacity-40",
    props.size === "sm" && "h-8 rounded-full px-3 text-[13px]",
    props.size === "md" && "h-10 rounded-full px-4 text-sm",
    props.size === "lg" && "h-12 rounded-full px-5 text-[15px]",
    props.variant === "primary" && "bg-coral-500 text-white shadow-glow hover:-translate-y-0.5 hover:bg-coral-400",
    props.variant === "soft" && "bg-ink-950 text-paper hover:bg-ink-800",
    props.variant === "ghost" && "text-ink-600 hover:bg-ink-100 hover:text-ink-950",
    props.variant === "outline" && "border border-line bg-paper text-ink-800 shadow-inset hover:border-ink-300 hover:bg-white",
    props.variant === "danger" && "bg-red-500 text-white hover:bg-red-400",
  ),
);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
