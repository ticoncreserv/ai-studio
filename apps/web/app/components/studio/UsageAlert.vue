<script setup lang="ts">
import { TriangleAlert, X } from "@lucide/vue";
import type { UsageAlertKind } from "~/utils/usage";

const props = defineProps<{
  kind: UsageAlertKind;
  remaining: string;
  limit: string;
  paused?: boolean;
}>();

const emit = defineEmits<{ dismiss: [] }>();

const { t } = useI18n();

const title = computed(() =>
  t(props.kind === "exhausted" ? "usage.alert.exhaustedTitle" : "usage.alert.warnTitle"),
);
const body = computed(() =>
  props.kind === "exhausted"
    ? t("usage.alert.exhaustedBody")
    : t("usage.alert.warnBody", { remaining: props.remaining, limit: props.limit }),
);
</script>

<template>
  <div
    class="cx-panel px-3 py-2"
    :class="kind === 'exhausted' ? 'cx-panel-danger' : 'cx-panel-warn'"
    :role="kind === 'exhausted' ? 'alert' : 'status'"
  >
    <div class="flex items-start gap-2">
      <TriangleAlert
        class="mt-0.5 h-3.5 w-3.5 shrink-0"
        :class="kind === 'exhausted' ? 'text-coral-400' : 'text-amber-200/80'"
      />
      <div class="min-w-0 flex-1">
        <p class="text-[12px] font-medium text-ink-950">{{ title }}</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-ink-600">{{ body }}</p>
        <p v-if="kind === 'exhausted' && paused" class="mt-0.5 text-[12px] leading-relaxed text-ink-600">
          {{ t("usage.alert.exhaustedPaused") }}
        </p>
        <p class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("usage.alert.contactAdmin") }}</p>
      </div>
      <UiIconButton :label="t('usage.alert.dismiss')" size="sm" @click="emit('dismiss')">
        <X class="h-3.5 w-3.5" />
      </UiIconButton>
    </div>
  </div>
</template>
