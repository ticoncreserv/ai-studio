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
    props.size === "sm" && "h-8 rounded-[9px] px-3 text-[13px]",
    props.size === "md" && "h-10 rounded-[10px] px-4 text-sm",
    props.size === "lg" && "h-11 rounded-[11px] px-5 text-[15px]",
    props.variant === "primary" && "bg-coral-500 text-[#061018] shadow-glow hover:bg-coral-400",
    props.variant === "soft" && "bg-white/10 text-ink-950 hover:bg-white/15",
    props.variant === "ghost" && "text-ink-600 hover:bg-white/5 hover:text-ink-950",
    props.variant === "outline" && "border border-line bg-white/5 text-ink-800 shadow-inset hover:bg-white/10",
    props.variant === "danger" && "bg-red-500 text-white hover:bg-red-400",
  ),
);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
