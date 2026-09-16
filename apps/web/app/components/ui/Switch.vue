<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-coral-500/60"
    :class="modelValue ? 'bg-emerald-500' : 'bg-white/[0.14]'"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute top-[2px] left-[2px] h-4 w-4 rounded-full bg-white shadow-lift transition-transform duration-150"
      :class="modelValue ? 'translate-x-4' : 'translate-x-0'"
    />
  </button>
</template>
