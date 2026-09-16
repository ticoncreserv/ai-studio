<script setup lang="ts">
import { cn } from "~/utils/cn";

defineProps<{
  modelValue?: string;
  placeholder?: string;
  type?: string;
}>();
defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <input
    :value="modelValue"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :class="
      cn(
        'h-11 w-full rounded-2xl border border-line bg-white/80 px-3.5 text-sm text-ink-950 outline-none',
        'shadow-inset placeholder:text-ink-300 focus:border-coral-400 focus:ring-4 focus:ring-coral-100',
      )
    "
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
