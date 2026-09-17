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
  slashOpen,
  slashHits,
  skillChip,
  spectator,
  toast,
  sending,
  queue,
  workingSince,
  showWorking,
  failedEventId,
  enterEventId,
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
  insertSkill,
  clearSkill,
  closeSlash,
  toggleSkill,
  toggleMcp,
  saveUserSkill,
  deleteUserSkill,
  saveUserMcp,
  deleteUserMcp,
  refresh,
  sendCommand,
  submit,
  cancelRun,
  dropQueue,
  retryFailed,
  newSession,
  selectSession,
  copyLink,
  insertMention,
  attachFiles,
  toggleSpectator,
  setProvider,
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

const railOpen = ref(true);

const usageBlocked = computed(() => data.value?.usage?.decision.decision === "block");
const usageNotice = computed(() => {
  const usage = data.value?.usage;
  if (!usage || usage.decision.decision === "allow" || !usage.decision.reason) return "";
  const reason = t(`usage.reason.${usage.decision.reason}`);
  return usage.decision.decision === "block"
    ? t("usage.blocked", { reason })
    : t("usage.warn", { reason, remaining: usage.remainingTokens });
});

const conversationTitle = computed(() => data.value?.session?.title || t("workspace.project"));
const sessionIndex = computed(() =>
  data.value?.sessions.findIndex((session) => session.id === data.value?.session?.id) ?? -1,
);

function stepSession(delta: number) {
  const list = data.value?.sessions ?? [];
  const next = list[sessionIndex.value + delta];
  if (next) void selectSession(next.id);
}

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
  <div v-if="loadError" class="flex min-h-screen items-center justify-center bg-canvas px-6">
    <div class="cx-panel w-full max-w-sm p-6">
      <UiLogo :size="24" />
      <h1 class="mt-4 text-[15px] font-semibold text-ink-950">{{ t("workspace.loadError") }}</h1>
      <UiButton class="mt-4" size="sm" @click="refresh">{{ t("workspace.retry") }}</UiButton>
    </div>
  </div>

  <div v-else-if="!data" class="flex h-screen items-center justify-center bg-canvas">
    <div class="flex flex-col items-center">
      <UiSpinner size="md" :label="t('workspace.loading')" />
      <p class="mt-3 text-[13px] font-medium text-ink-950">{{ t("workspace.loading") }}</p>
      <p class="mt-1 text-[12px] text-ink-400">{{ t("workspace.loadingHint") }}</p>
    </div>
  </div>

  <div v-else class="flex h-screen flex-col overflow-hidden bg-canvas lg:flex-row">
    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-none"
      :class="[
        railOpen ? 'lg:w-[555px]' : 'lg:w-[340px]',
        mobileTab === 'preview' ? 'hidden lg:flex' : 'flex',
      ]"
    >
      <StudioHeader
        :title="conversationTitle"
        :branch="data.workspace.branch"
        :status-label="statusLabel(data.workspace.status)"
        :status-tone="statusTone(data.workspace.status)"
        :show-status="data.workspace.status !== 'running'"
        :login="data.user.login"
        :presence-count="data.presence.length"
        :presence-label="t('workspace.presence', { count: data.presence.length })"
        :publish-enabled="!!data?.flags?.publish"
        :platform-admin="!!data.user.platformAdmin"
        :rail-open="railOpen"
        :can-go-prev="sessionIndex > 0"
        :can-go-next="sessionIndex >= 0 && sessionIndex < data.sessions.length - 1"
        @invite="dialog = 'invite'"
        @share="dialog = 'share'"
        @rules="sheet = 'rules'"
        @connections="sheet = 'connections'"
        @settings="sheet = 'settings'"
        @shortcuts="dialog = 'shortcuts'"
        @sign-out="signOut"
        @toggle-rail="railOpen = !railOpen"
        @prev="stepSession(-1)"
        @next="stepSession(1)"
      />

      <div class="flex min-h-0 min-w-0 flex-1">
        <StudioSessionRail
          v-if="railOpen"
          class="hidden w-[215px] shrink-0 lg:flex"
          :sessions="data.sessions"
          :active-id="data.session?.id"
          :query="query"
          :login="data.user.login"
          @update:query="query = $event"
          @search="refresh"
          @select="selectSession"
          @create="newSession"
          @rules="sheet = 'rules'"
          @skills="sheet = 'skills'"
          @mcp="sheet = 'mcp'"
          @settings="sheet = 'settings'"
        />

        <StudioChatPane
          :events="events"
          :sending="sending"
          :show-working="showWorking"
          :working-since="workingSince"
          :failed-event-id="failedEventId"
          :enter-event-id="enterEventId"
          :query="query"
          @command="onCommand"
          @update:query="query = $event"
          @search="refresh"
          @create="newSession"
          @suggestion="useSuggestion"
          @fork="newSession"
          @retry="retryFailed"
        >
          <p v-if="data.agent?.error" class="px-3 pb-1.5 text-[11px] text-amber-200/80">{{ t("chat.providerRequired") }}</p>
          <p v-else-if="usageNotice" class="px-3 pb-1.5 text-[11px] text-amber-200/80">{{ usageNotice }}</p>
          <StudioComposer
            v-model="prompt"
            :mode="mode"
            :recipe-id="recipeId"
            :recipes="data.recipes"
            :recipes-enabled="!!data?.flags?.recipes"
            :spectator="spectator"
            :spectator-enabled="!!data?.flags?.spectator"
            :sending="sending"
            :provider="data.session?.provider ?? data.preferredProvider"
            :providers="data.providers"
            :attachments="attachments"
            :placeholder="sending || events.length ? t('chat.followUp') : t('chat.placeholder')"
            :mentions-open="mentionsOpen"
            :mention-hits="mentionHits"
            :slash-open="slashOpen"
            :slash-hits="slashHits"
            :skill-chip="skillChip"
            :skills="data.skills ?? []"
            :mcp-servers="data.mcp?.servers ?? []"
            :skills-enabled="!!data?.flags?.skills"
            :mcp-enabled="!!data?.flags?.mcp"
            :can-edit="data.canEdit && !spectator"
            :usage-blocked="usageBlocked"
            :queue="queue"
            @update:mode="mode = $event"
            @update:recipe-id="recipeId = $event"
            @submit="submit"
            @cancel="cancelRun"
            @mention="insertMention"
            @skill="insertSkill"
            @clear-skill="clearSkill"
            @close-slash="closeSlash"
            @toggle-skill="toggleSkill($event.name, $event.enabled)"
            @toggle-mcp="toggleMcp($event.name, $event.enabled)"
            @manage-skills="sheet = 'skills'"
            @manage-mcp="sheet = 'mcp'"
            @attach="attachFiles"
            @remove-attachment="attachments = attachments.filter((a) => a.path !== $event)"
            @toggle-spectator="toggleSpectator"
            @drop-queue="dropQueue"
            @update:provider="setProvider"
          />
        </StudioChatPane>
      </div>
    </div>

    <StudioPreviewPane
      class="min-w-0 flex-1"
      :class="mobileTab === 'chat' ? 'hidden lg:flex' : 'flex'"
      :src="previewSrc"
      :status="data.workspace.status"
      :title="t('workspace.project')"
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
      @toggle-rail="railOpen = !railOpen"
    />

    <nav class="grid shrink-0 grid-cols-2 border-t border-line bg-surface lg:hidden">
      <button
        type="button"
        class="py-2.5 text-[12px]"
        :class="mobileTab === 'chat' ? 'text-ink-950' : 'text-ink-400'"
        @click="mobileTab = 'chat'"
      >
        {{ t("workspace.openChat") }}
      </button>
      <button
        type="button"
        class="py-2.5 text-[12px]"
        :class="mobileTab === 'preview' ? 'text-ink-950' : 'text-ink-400'"
        @click="mobileTab = 'preview'"
      >
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
      @save-user-skill="saveUserSkill"
      @delete-user-skill="deleteUserSkill"
      @save-user-mcp="saveUserMcp($event.name, $event.config)"
      @delete-user-mcp="deleteUserMcp"
      @toggle-skill="toggleSkill($event.name, $event.enabled)"
      @toggle-mcp="toggleMcp($event.name, $event.enabled)"
      @copy-invite="copyLink('invite')"
      @copy-share="copyLink('share')"
      @hibernate="hibernate"
      @sync="sendCommand({ type: 'sync_base' })"
      @update:question-answers="questionAnswers = $event"
    />
  </div>
</template>
