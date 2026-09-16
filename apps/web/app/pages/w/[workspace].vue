<script setup lang="ts">
import type { ClientCommand } from "@atelier/contracts";

const studio = useStudio();
const {
  t,
  data,
  loadError,
  prompt,
  query,
  viewport,
  rotated,
  dialog,
  sheet,
  paletteQuery,
  mentionsOpen,
  spectator,
  toast,
  sending,
  previewBusy,
  previewKey,
  toolMode,
  mode,
  recipeId,
  attachments,
  mobileTab,
  debugOpen,
  previewDebug,
  questionAnswers,
  events,
  previewSrc,
  pendingPlan,
  pendingQuestion,
  pendingPermission,
  lastRuntimeError,
  commands,
  filteredCommands,
  mentionHits,
  refresh,
  sendCommand,
  submit,
  newSession,
  selectSession,
  copyLink,
  insertMention,
  attachFiles,
  toggleSpectator,
  saveRules,
  saveUserEnv,
  hibernate,
  resume,
  signOut,
  addPreviewNote,
  statusTone,
  statusLabel,
  useSuggestion,
} = studio;

function onCommand(payload: { type: string; [key: string]: unknown }) {
  void sendCommand(payload as ClientCommand);
}

function onFixDebug() {
  const eventId = lastRuntimeError.value && lastRuntimeError.value.type === "runtime_error" ? lastRuntimeError.value.id : "";
  if (!eventId) return;
  void sendCommand({ type: "fix_error", eventId });
  debugOpen.value = false;
}
</script>

<template>
  <div v-if="loadError" class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="glass-window w-full max-w-md p-8">
      <UiLogo />
      <h1 class="mt-6 font-display text-4xl">{{ t("workspace.loadError") }}</h1>
      <UiButton class="mt-6" @click="refresh">{{ t("workspace.retry") }}</UiButton>
    </div>
  </div>

  <div v-else-if="!data" class="flex h-screen items-center justify-center bg-canvas">
    <div class="text-center">
      <UiSpinner size="lg" :label="t('workspace.loading')" />
      <UiLogo class="mt-5" :size="40" />
      <p class="mt-4 text-sm text-ink-500">{{ t("workspace.loading") }}</p>
      <p class="mt-1 text-[12px] text-ink-300">{{ t("workspace.loadingHint") }}</p>
    </div>
  </div>

  <div v-else class="os-desktop flex h-screen flex-col overflow-hidden">
    <StudioHeader
      :project="t('workspace.project')"
      :branch="data.workspace.branch"
      :status="data.workspace.status"
      :status-label="statusLabel(data.workspace.status)"
      :status-tone="statusTone(data.workspace.status)"
      :login="data.user.login"
      :presence-count="data.presence.length"
      :presence-label="t('workspace.presence', { count: data.presence.length })"
      :publish-enabled="!!data?.flags?.publish"
      :platform-admin="!!data.user.platformAdmin"
      @invite="dialog = 'invite'"
      @share="dialog = 'share'"
      @rules="sheet = 'rules'"
      @connections="sheet = 'connections'"
      @settings="sheet = 'settings'"
      @sign-out="signOut"
    />

    <div class="flex min-h-0 flex-1 gap-3 p-3">
      <UiWindow :title="t('workspace.sessionsTitle')" class="hidden w-[228px] shrink-0 lg:flex">
        <StudioSessionRail
          :sessions="data.sessions"
          :active-id="data.session?.id"
          :query="query"
          @update:query="query = $event"
          @search="refresh"
          @select="selectSession"
          @create="newSession"
        />
      </UiWindow>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:flex-row">
        <UiWindow
          :title="t('workspace.openChat')"
          class="min-h-0 w-full lg:w-[440px] lg:shrink-0"
          :class="mobileTab === 'preview' ? 'hidden lg:flex' : 'flex'"
        >
          <StudioChatPane
            :events="events"
            :sending="sending"
            :spectator="spectator"
            :spectator-enabled="!!data?.flags?.spectator"
            :query="query"
            @command="onCommand"
            @update:query="query = $event"
            @search="refresh"
            @create="newSession"
            @suggestion="useSuggestion"
            @toggle-spectator="toggleSpectator"
          >
            <StudioComposer
              v-model="prompt"
              :mode="mode"
              :recipe-id="recipeId"
              :recipes="data.recipes"
              :recipes-enabled="!!data?.flags?.recipes"
              :spectator="spectator"
              :sending="sending"
              :provider="data.session?.provider ?? data.preferredProvider"
              :attachments="attachments"
              :mentions-open="mentionsOpen"
              :mention-hits="mentionHits"
              @update:mode="mode = $event"
              @update:recipe-id="recipeId = $event"
              @submit="submit"
              @cancel="sendCommand({ type: 'cancel' })"
              @mention="insertMention"
              @attach="attachFiles"
              @remove-attachment="attachments = attachments.filter((a) => a.path !== $event)"
            />
          </StudioChatPane>
        </UiWindow>

        <UiWindow
          :title="t('preview.title')"
          class="min-h-0 min-w-0 flex-1"
          :class="mobileTab === 'chat' ? 'hidden lg:flex' : 'flex'"
        >
        <p v-if="data.agent?.error" class="px-4 py-2 text-[12px] text-amber-100">{{ t("chat.cursorRequired") }}</p>
        <StudioPreviewPane
          :src="previewSrc"
          :status="data.workspace.status"
          :viewport="viewport"
          :rotated="rotated"
          :preview-key="previewKey"
          :tool-mode="toolMode"
          :debug-open="debugOpen"
          :debug="previewDebug"
          :last-error="data.workspace.lastError"
          :resuming="previewBusy"
          @update:viewport="viewport = $event"
          @update:rotated="rotated = $event"
          @update:tool-mode="toolMode = $event"
          @update:debug-open="debugOpen = $event"
          @refresh="previewKey += 1"
          @note="addPreviewNote"
          @resume="resume"
          @fix-debug="onFixDebug"
        />
        </UiWindow>
      </div>
    </div>

    <nav class="grid grid-cols-2 border-t border-line bg-black/40 lg:hidden">
      <button type="button" class="py-3 text-[13px] font-semibold" :class="mobileTab === 'chat' ? 'text-ink-950' : 'text-ink-300'" @click="mobileTab = 'chat'">
        {{ t("workspace.openChat") }}
      </button>
      <button type="button" class="py-3 text-[13px] font-semibold" :class="mobileTab === 'preview' ? 'text-ink-950' : 'text-ink-300'" @click="mobileTab = 'preview'">
        {{ t("workspace.openPreview") }}
      </button>
    </nav>

    <StudioOverlays
      :data="data"
      :sheet="sheet"
      :dialog="dialog"
      :palette-query="paletteQuery"
      :commands="commands"
      :filtered-commands="filteredCommands"
      :pending-plan="pendingPlan"
      :pending-question="pendingQuestion"
      :pending-permission="pendingPermission"
      :question-answers="questionAnswers"
      :toast="toast"
      @update:sheet="sheet = $event"
      @update:dialog="dialog = $event"
      @update:palette-query="paletteQuery = $event"
      @command="onCommand"
      @save-rules="saveRules"
      @save-user-env="saveUserEnv"
      @copy-invite="copyLink('invite')"
      @copy-share="copyLink('share')"
      @hibernate="hibernate"
      @sync="sendCommand({ type: 'sync_base' })"
      @update:question-answers="questionAnswers = $event"
    />
  </div>
</template>
