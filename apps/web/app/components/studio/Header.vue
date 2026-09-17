<script setup lang="ts">
import { GitBranch, PanelLeft, Share2, UserPlus } from "@lucide/vue";

defineProps<{
  title: string;
  branch: string;
  statusLabel: string;
  showStatus: boolean;
  login: string;
  presenceCount: number;
  presenceLabel: string;
  railOverlayOpen: boolean;
  railDockedClosed?: boolean;
}>();

const emit = defineEmits<{
  invite: [];
  share: [];
  "toggle-rail": [];
  "close-sidebar": [];
}>();

const { t } = useI18n();
</script>

<template>
  <header class="relative z-40 flex shrink-0">
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="cx-titlebar flex min-w-0 items-center">
        <UiIconButton
          class="min-[900px]:hidden"
          :label="t('workspace.closeChat')"
          size="sm"
          @click="emit('close-sidebar')"
        >
          <PanelLeft class="h-3.5 w-3.5" />
        </UiIconButton>
        <UiIconButton
          v-if="!railOverlayOpen"
          :class="railDockedClosed ? undefined : 'min-[1200px]:hidden'"
          :label="t('nav.toggleRail')"
          size="sm"
          aria-controls="studio-session-rail"
          :aria-expanded="railOverlayOpen"
          @click="emit('toggle-rail')"
        >
          <PanelLeft class="h-3.5 w-3.5" />
        </UiIconButton>

        <p class="min-w-0 truncate text-[13px] text-ink-950" :title="`${title} · ${branch}`">{{ title }}</p>
        <GitBranch class="h-3 w-3 shrink-0 text-ink-400" :title="branch" />

        <div class="ml-auto flex shrink-0 items-center gap-0.5">
          <div v-if="presenceCount > 1" class="mr-1 hidden md:flex" :title="presenceLabel">
            <UiAvatar :name="login" size="sm" />
          </div>
          <UiIconButton :label="t('nav.invite')" size="sm" @click="emit('invite')">
            <UserPlus class="h-3.5 w-3.5" />
          </UiIconButton>
          <UiIconButton :label="t('nav.share')" size="sm" @click="emit('share')">
            <Share2 class="h-3.5 w-3.5" />
          </UiIconButton>
        </div>
      </div>
      <p
        v-if="showStatus"
        class="min-w-0 truncate px-2 pb-1.5 text-[11px] leading-tight text-ink-500"
        :title="statusLabel"
      >
        {{ statusLabel }}
      </p>
    </div>
  </header>
</template>
