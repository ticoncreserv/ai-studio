<script setup lang="ts">
import type { AgentMode } from "@atelier/contracts";
import { ArrowUp, Paperclip, X } from "@lucide/vue";
import type { StudioAttachment } from "~/types/studio";

const props = defineProps<{
  modelValue: string;
  mode: AgentMode;
  recipeId: string;
  recipes: Array<{ id: string; title: string }>;
  recipesEnabled: boolean;
  spectator: boolean;
  sending: boolean;
  provider: string;
  attachments: StudioAttachment[];
  mentionsOpen: boolean;
  mentionHits: Array<{ item: string; kind: string }>;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:mode": [value: AgentMode];
  "update:recipeId": [value: string];
  submit: [];
  cancel: [];
  mention: [name: string];
  attach: [files: FileList];
  "remove-attachment": [path: string];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);

function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length) {
    e.preventDefault();
    const list = e.clipboardData!.files;
    emit("attach", list);
  }
}

const modeHint = computed(() => {
  if (props.mode === "plan") return t("chat.modeHintPlan");
  if (props.mode === "ask") return t("chat.modeHintAsk");
  return t("chat.modeHintAgent");
});
</script>

<template>
  <form class="relative border-t border-line p-3" @submit.prevent="emit('submit')">
    <div v-if="mentionsOpen" class="absolute inset-x-3 bottom-full z-10 mb-1 overflow-hidden rounded-xl border border-line bg-paper shadow-float">
      <p v-if="!mentionHits.length" class="px-3 py-2 text-[12px] text-ink-300">{{ t("chat.noMentions") }}</p>
      <button
        v-for="hit in mentionHits"
        :key="hit.kind + hit.item"
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-canvas"
        @click="emit('mention', hit.item)"
      >
        <span class="font-mono">{{ hit.item }}</span>
        <span class="text-[10px] uppercase tracking-wider text-ink-300">{{ hit.kind }}</span>
      </button>
    </div>

    <div class="rounded-[12px] border border-line bg-white/5 p-2 shadow-inset">
      <div v-if="attachments.length" class="mb-1 flex flex-wrap gap-1 px-2 pt-1">
        <span
          v-for="file in attachments"
          :key="file.path"
          class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-1 text-[11px] text-ink-600"
        >
          {{ file.name }}
          <button type="button" :aria-label="t('chat.removeAttachment')" @click="emit('remove-attachment', file.path)">
            <X class="h-3 w-3" />
          </button>
        </span>
      </div>
      <textarea
        id="composer"
        :value="modelValue"
        :disabled="spectator"
        :placeholder="t('chat.placeholder')"
        class="h-[72px] w-full resize-none bg-transparent px-3 pt-2 text-sm outline-none placeholder:text-ink-300"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @keydown.meta.enter.prevent="emit('submit')"
        @keydown.ctrl.enter.prevent="emit('submit')"
        @paste="onPaste"
      />
      <div class="flex items-center justify-between gap-2 px-1 pb-1">
        <div class="flex min-w-0 items-center gap-1">
          <input ref="fileInput" type="file" multiple class="hidden" @change="emit('attach', ($event.target as HTMLInputElement).files!)" />
          <UiIconButton :label="t('chat.attach')" size="sm" @click="fileInput?.click()">
            <Paperclip class="h-4 w-4" />
          </UiIconButton>
          <span class="rounded-[8px] bg-white/5 px-2 py-1 text-[11px] font-semibold text-ink-600">
            {{ provider === "cursor" ? t("chat.usingCursor") : provider === "mock" ? t("chat.usingMock") : provider }}
          </span>
          <select
            class="h-8 max-w-[110px] rounded-[8px] bg-white/5 px-2 text-[11px] font-semibold text-ink-800 outline-none"
            :value="mode"
            @change="emit('update:mode', ($event.target as HTMLSelectElement).value as AgentMode)"
          >
            <option value="agent">{{ t("chat.modeAgent") }}</option>
            <option value="plan">{{ t("chat.modePlan") }}</option>
            <option value="ask">{{ t("chat.modeAsk") }}</option>
          </select>
          <select
            v-if="recipesEnabled"
            class="h-8 max-w-[140px] truncate rounded-[8px] bg-white/5 px-2 text-[11px] font-semibold text-ink-800 outline-none"
            :value="recipeId"
            @change="emit('update:recipeId', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t("chat.recipe") }}</option>
            <option v-for="recipe in recipes" :key="recipe.id" :value="recipe.id">{{ recipe.title }}</option>
          </select>
        </div>
        <div class="flex items-center gap-1">
          <UiIconButton :label="t('chat.cancel')" size="sm" @click="emit('cancel')">
            <X class="h-4 w-4" />
          </UiIconButton>
          <button
            type="submit"
            :disabled="spectator || sending"
            class="flex h-8 w-8 items-center justify-center rounded-[9px] bg-coral-500 text-[#061018] shadow-glow transition hover:bg-coral-400 disabled:opacity-40"
            :aria-label="t('chat.send')"
          >
            <ArrowUp class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
    <p class="mt-1.5 px-2 text-[11px] text-ink-300">{{ spectator ? t("workspace.spectator") : recipeId ? t("chat.recipeHint") : modeHint }}</p>
  </form>
</template>
