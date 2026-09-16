<script setup lang="ts">
const props = withDefaults(
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
  <div class="flex max-w-sm flex-col items-center px-6 text-center" role="status" aria-live="polite" :aria-busy="tone === 'wait'">
    <UiSpinner v-if="tone === 'wait'" size="lg" :label="title" />
    <span
      v-else
      class="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-sm font-semibold text-red-200"
      aria-hidden="true"
    >
      !
    </span>
    <p class="font-display mt-4 text-2xl leading-tight text-ink-950">{{ title }}</p>
    <p v-if="hint" class="mt-2 text-sm leading-relaxed text-ink-500">{{ hint }}</p>
    <p v-if="elapsed && tone === 'wait'" class="mt-3 font-mono text-[11px] text-ink-300">{{ elapsed }}</p>
    <div v-if="tone === 'wait'" class="atelier-wait-bar mt-4 w-full max-w-[220px]" aria-hidden="true">
      <i />
    </div>
    <slot />
  </div>
</template>
