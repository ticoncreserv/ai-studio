<script setup lang="ts">
import type { Viewport } from "@atelier/contracts";
import type { PreviewTool } from "~/types/studio";
import {
  ExternalLink,
  MessageCircle,
  Monitor,
  MousePointer2,
  Pencil,
  RefreshCw,
  RotateCw,
  Smartphone,
  Tablet,
} from "lucide-vue-next";

const props = defineProps<{
  src: string;
  status: string;
  viewport: Viewport;
  rotated: boolean;
  previewKey: number;
  toolMode: PreviewTool;
  debugOpen: boolean;
}>();

const emit = defineEmits<{
  "update:viewport": [value: Viewport];
  "update:rotated": [value: boolean];
  "update:toolMode": [value: PreviewTool];
  "update:debugOpen": [value: boolean];
  refresh: [];
  note: [text: string];
  resume: [];
  fixDebug: [];
}>();

const { t } = useI18n();

const sizes: Record<Viewport, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 834, h: 1112 },
  desktop: { w: 1280, h: 800 },
};

const frame = computed(() => {
  const { w, h } = sizes[props.viewport];
  const width = props.rotated && props.viewport !== "desktop" ? h : w;
  const height = props.rotated && props.viewport !== "desktop" ? w : h;
  if (props.viewport === "desktop") return { width: "100%", height: "100%", maxWidth: "100%" };
  return {
    width: `min(100%, ${Math.round(width * 0.72)}px)`,
    height: `min(100%, ${Math.round(height * 0.72)}px)`,
  };
});

function onOverlayClick(e: MouseEvent) {
  if (props.toolMode === "select") return;
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.round(((e.clientX - box.left) / box.width) * 100);
  const y = Math.round(((e.clientY - box.top) / box.height) * 100);
  emit("note", `Preview ${props.toolMode} at ${x}%, ${y}%: `);
}
</script>

<template>
  <section class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 items-center gap-2 border-b border-line px-3">
      <div class="flex rounded-[9px] bg-white/5 p-0.5">
        <UiIconButton :label="t('preview.mobile')" size="sm" :active="viewport === 'mobile'" @click="emit('update:viewport', 'mobile')">
          <Smartphone class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.tablet')" size="sm" :active="viewport === 'tablet'" @click="emit('update:viewport', 'tablet')">
          <Tablet class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.desktop')" size="sm" :active="viewport === 'desktop'" @click="emit('update:viewport', 'desktop')">
          <Monitor class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
      <div class="hidden min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-line bg-black/30 px-3 py-1 text-[12px] text-ink-500 sm:flex">
        <span class="h-1.5 w-1.5 rounded-full" :class="status === 'running' ? 'bg-emerald-400' : 'bg-amber-400'" />
        <span class="truncate font-mono text-[11px]" :title="t('preview.address')">{{ src || t("preview.home") }}</span>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <UiIconButton v-if="viewport !== 'desktop'" :label="t('preview.rotate')" @click="emit('update:rotated', !rotated)">
          <RotateCw class="h-4 w-4" />
        </UiIconButton>
        <UiIconButton :label="t('preview.refresh')" @click="emit('refresh')">
          <RefreshCw class="h-4 w-4" />
        </UiIconButton>
        <a :href="src" target="_blank">
          <UiIconButton :label="t('preview.openTab')">
            <ExternalLink class="h-4 w-4" />
          </UiIconButton>
        </a>
      </div>
    </div>

    <div class="preview-dots relative m-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-line">
      <div
        v-if="status === 'running'"
        class="relative overflow-hidden bg-white shadow-float"
        :class="viewport === 'desktop' ? 'h-full w-full rounded-[10px]' : 'rounded-[28px] border-[8px] border-black'"
        :style="frame"
      >
        <div v-if="viewport !== 'desktop'" class="absolute left-1/2 top-2 z-10 h-3 w-16 -translate-x-1/2 rounded-full bg-black/70" />
        <iframe :key="previewKey" :src="src" :title="t('preview.title')" class="h-full w-full bg-white" />
        <button
          v-if="toolMode !== 'select'"
          type="button"
          class="absolute inset-0 z-10 cursor-crosshair bg-coral-500/10"
          :aria-label="t('preview.inspectHint')"
          @click="onOverlayClick"
        />
      </div>
      <div v-else class="max-w-sm px-6 text-center">
        <p class="font-display text-3xl text-ink-950">
          {{ status === "hibernated" ? t("preview.hibernated") : status === "error" ? t("preview.error") : t("preview.booting") }}
        </p>
        <p class="mt-2 text-sm text-ink-500">{{ t("workspace.resumeHint") }}</p>
        <UiButton class="mt-4" size="sm" @click="emit('resume')">{{ t("workspace.resume") }}</UiButton>
      </div>

      <div class="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-[11px] border border-line bg-black/45 p-1 shadow-float backdrop-blur-xl">
        <UiIconButton :label="t('preview.select')" size="sm" :active="toolMode === 'select'" @click="emit('update:toolMode', 'select')">
          <MousePointer2 class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.annotate')" size="sm" :active="toolMode === 'annotate'" @click="emit('update:toolMode', 'annotate')">
          <Pencil class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton :label="t('preview.comment')" size="sm" :active="toolMode === 'comment'" @click="emit('update:toolMode', 'comment')">
          <MessageCircle class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>

      <button
        type="button"
        class="absolute right-4 top-4 z-20 rounded-[9px] border border-line bg-black/45 px-3 py-1.5 text-[11px] font-medium text-ink-800 backdrop-blur-xl"
        @click="emit('update:debugOpen', !debugOpen)"
      >
        {{ t("preview.debugTime", { ms: 42 }) }} · {{ t("preview.debugQueries", { count: 3 }) }}
      </button>

      <div v-if="debugOpen" class="glass-window absolute right-4 top-14 z-20 w-64 p-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-300">{{ t("preview.debugTitle") }}</p>
        <ul class="mt-2 space-y-1 text-[12px] text-ink-600">
          <li>{{ t("preview.debugTime", { ms: 42 }) }}</li>
          <li>{{ t("preview.debugQueries", { count: 3 }) }}</li>
          <li>{{ t("preview.debugMemory", { mb: 28 }) }}</li>
          <li class="text-amber-200">{{ t("preview.nPlusOne") }}</li>
        </ul>
        <UiButton class="mt-3 w-full" size="sm" @click="emit('fixDebug')">{{ t("preview.debugFix") }}</UiButton>
      </div>
    </div>
  </section>
</template>
