<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    hint?: string;
    elapsed?: string;
    tone?: "wait" | "error";
  }>(),
  { tone: "wait" },
);
</script>

<template>
  <div class="flex max-w-[300px] flex-col items-center px-6 text-center" role="status" aria-live="polite" :aria-busy="tone === 'wait'">
    <UiSpinner v-if="tone === 'wait'" size="md" :label="title" />
    <span
      v-else
      class="flex h-6 w-6 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-[12px] font-medium text-red-300"
      aria-hidden="true"
    >
      !
    </span>
    <p class="mt-3 text-[13px] font-medium text-ink-950">{{ title }}</p>
    <p v-if="hint" class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ hint }}</p>
    <p v-if="elapsed && tone === 'wait'" class="mt-2 font-mono text-[11px] text-ink-400">{{ elapsed }}</p>
    <div v-if="tone === 'wait'" class="atelier-wait-bar mt-3 w-full max-w-[180px]" aria-hidden="true">
      <i />
    </div>
    <slot />
  </div>
</template>
