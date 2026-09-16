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
        'h-[30px] w-full rounded-[6px] border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink-950 outline-none',
        'transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-coral-500/55',
      )
    "
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
