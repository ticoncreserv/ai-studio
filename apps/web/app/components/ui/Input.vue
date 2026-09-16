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
        'h-11 w-full rounded-[11px] border border-line bg-white/5 px-3.5 text-sm text-ink-950 outline-none',
        'shadow-inset placeholder:text-ink-300 focus:border-coral-500/50 focus:ring-4 focus:ring-coral-500/15',
      )
    "
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
