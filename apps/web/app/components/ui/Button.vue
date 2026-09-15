<script setup lang="ts">
import { cn } from "~/utils/cn";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "ghost" | "outline" | "danger";
    size?: "sm" | "md";
    type?: "button" | "submit";
    disabled?: boolean;
  }>(),
  { variant: "primary", size: "md", type: "button" },
);

const classes = computed(() =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:opacity-40",
    props.size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
    props.variant === "primary" && "bg-copper-500 text-ink-950 hover:bg-copper-400",
    props.variant === "ghost" && "text-ink-200 hover:bg-ink-800",
    props.variant === "outline" && "border border-ink-700 text-ink-200 hover:bg-ink-800",
    props.variant === "danger" && "bg-red-500/90 text-white hover:bg-red-400",
  ),
);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
