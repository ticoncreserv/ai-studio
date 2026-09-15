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
        'h-9 w-full rounded-md border border-ink-700 bg-ink-900 px-3 text-sm text-ink-200 outline-none',
        'placeholder:text-ink-500 focus:border-copper-500',
      )
    "
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
