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
    class="relative h-6 w-10 rounded-full transition"
    :class="modelValue ? 'bg-coral-500' : 'bg-ink-100'"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-lift transition"
      :class="modelValue ? 'translate-x-4' : 'translate-x-0'"
    />
  </button>
</template>
