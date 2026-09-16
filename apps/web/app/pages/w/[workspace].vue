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
  previewKey,
  toolMode,
  mode,
  recipeId,
  attachments,
  mobileTab,
  debugOpen,
  questionAnswers,
  events,
  previewSrc,
  pendingPlan,
  pendingQuestion,
  pendingPermission,
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
  patchFlags,
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
  void sendCommand({ type: "fix_error", eventId: "debug-overlay" });
  debugOpen.value = false;
}
</script>

<template>
  <div v-if="loadError" class="mesh flex min-h-screen items-center justify-center px-6">
    <div class="w-full max-w-md rounded-2xl border border-line bg-paper p-8 shadow-float">
      <UiLogo />
      <h1 class="mt-6 font-display text-4xl">{{ t("workspace.loadError") }}</h1>
      <UiButton class="mt-6" @click="refresh">{{ t("workspace.retry") }}</UiButton>
    </div>
  </div>

  <div v-else-if="!data" class="flex h-screen items-center justify-center bg-canvas">
    <div class="text-center">
      <UiLogo :size="40" />
      <p class="mt-4 text-sm text-ink-500">{{ t("workspace.loading") }}</p>
    </div>
  </div>

  <div v-else class="flex h-screen flex-col overflow-hidden bg-canvas">
    <StudioHeader
      :project="t('workspace.project')"
      :branch="data.workspace.branch"
      :status="data.workspace.status"
      :status-label="statusLabel(data.workspace.status)"
      :status-tone="statusTone(data.workspace.status)"
      :login="data.user.login"
      :presence-count="Math.max(1, data.presence.length)"
      :presence-label="t('workspace.presence', { count: Math.max(1, data.presence.length) })"
      :publish-enabled="!!data.flags.publish"
      @invite="dialog = 'invite'"
      @share="dialog = 'share'"
      @rules="sheet = 'rules'"
      @connections="sheet = 'connections'"
      @settings="sheet = 'settings'"
      @sign-out="signOut"
    />

    <div class="flex min-h-0 flex-1">
      <StudioSessionRail
        :sessions="data.sessions"
        :active-id="data.session?.id"
        :query="query"
        @update:query="query = $event"
        @search="refresh"
        @select="selectSession"
        @create="newSession"
      />

      <div class="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <div
          class="flex min-h-0 w-full flex-col lg:w-[420px] lg:shrink-0"
          :class="mobileTab === 'preview' ? 'hidden lg:flex' : 'flex'"
        >
          <StudioChatPane
            class="lg:border-r lg:border-line/80"
            :events="events"
            :sending="sending"
            :spectator="spectator"
            :spectator-enabled="!!data.flags.spectator"
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
              :recipes-enabled="!!data.flags.recipes"
              :spectator="spectator"
              :sending="sending"
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
        </div>

        <StudioPreviewPane
          class="min-w-0"
          :class="mobileTab === 'chat' ? 'hidden lg:flex' : 'flex'"
          :src="previewSrc"
          :status="data.workspace.status"
          :viewport="viewport"
          :rotated="rotated"
          :preview-key="previewKey"
          :tool-mode="toolMode"
          :debug-open="debugOpen"
          @update:viewport="viewport = $event"
          @update:rotated="rotated = $event"
          @update:tool-mode="toolMode = $event"
          @update:debug-open="debugOpen = $event"
          @refresh="previewKey += 1"
          @note="addPreviewNote"
          @resume="resume"
          @fix-debug="onFixDebug"
        />
      </div>
    </div>

    <nav class="grid grid-cols-2 border-t border-line bg-paper lg:hidden">
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
      @patch-flags="patchFlags"
      @copy-invite="copyLink('invite')"
      @copy-share="copyLink('share')"
      @hibernate="hibernate"
      @sync="sendCommand({ type: 'sync_base' })"
      @update:question-answers="questionAnswers = $event"
    />
  </div>
</template>
