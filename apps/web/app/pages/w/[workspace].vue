<script setup lang="ts">
import type { ClientCommand } from "@atelier/contracts";
import { previewDebugCommand, type PreviewDebugAction } from "~/utils/preview-debug-prompt";
import type { PreviewInspectTarget } from "~/utils/preview-inspect";
import {
  RAIL_STORAGE_KEY,
  SIDEBAR_STORAGE_KEY,
  resolveSidebarOpen,
  sidebarOverrideFromStorage,
  sidebarStorageValue,
  sidebarVisibilityClass,
  studioRailOverlays,
  type SidebarOverride,
} from "~/utils/studio-layout";
import {
  dismissUsageAlert,
  formatTokens,
  isUsageAlertDismissed,
  usageAlertKind,
  usageAlertStorageKey,
} from "~/utils/usage";

const studio = useStudio();
const {
  t,
  locale,
  data,
  loadError,
  prompt,
  query,
  viewport,
  rotated,
  dialog,
  linkUrl,
  linkBusy,
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
  inspectPins,
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
  commandBusy,
  submit,
  cancelRun,
  dropQueue,
  retryFailed,
  newSession,
  selectSession,
  copyLink,
  createInviteLink,
  revokeInvite,
  copyPendingInvite,
  removeMember,
  leaveWorkspace,
  inviteRole,
  inviteMembers,
  pendingInvites,
  invitePanelBusy,
  insertMention,
  attachFiles,
  toggleSpectator,
  setProvider,
  saveUserRule,
  deleteUserRule,
  saveUserEnv,
  hibernate,
  resume,
  addInspectPins,
  removeInspectPin,
  statusLabel,
  useSuggestion,
} = studio;

const railOverlayOpen = ref(false);
const railDockedClosed = ref(false);
const sidebarOverride = ref<SidebarOverride>(null);
const sidebarPaneClass = computed(() => sidebarVisibilityClass(sidebarOverride.value));

const clientReady = ref(false);
const usageDismissTick = ref(0);

onMounted(() => {
  clientReady.value = true;
  sidebarOverride.value = sidebarOverrideFromStorage(sessionStorage.getItem(SIDEBAR_STORAGE_KEY));
  railDockedClosed.value = sidebarOverrideFromStorage(sessionStorage.getItem(RAIL_STORAGE_KEY)) === false;
});

function persistSidebar(open: boolean) {
  sidebarOverride.value = open;
  sessionStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarStorageValue(open));
}

function persistRailDocked(open: boolean) {
  railDockedClosed.value = !open;
  sessionStorage.setItem(RAIL_STORAGE_KEY, sidebarStorageValue(open));
}

function toggleSidebar() {
  persistSidebar(!resolveSidebarOpen(sidebarOverride.value, window.innerWidth));
}

function closeRailOverlay() {
  railOverlayOpen.value = false;
}

function closeRail() {
  if (studioRailOverlays(window.innerWidth)) {
    closeRailOverlay();
    return;
  }
  persistRailDocked(false);
}

function toggleRailOverlay() {
  if (studioRailOverlays(window.innerWidth)) {
    railOverlayOpen.value = !railOverlayOpen.value;
    return;
  }
  persistRailDocked(railDockedClosed.value);
}

function onSelectSession(id: string) {
  selectSession(id);
  closeRailOverlay();
}

function onCreateSession() {
  newSession();
  closeRailOverlay();
}

function openSheet(name: typeof sheet.value) {
  sheet.value = name;
  closeRailOverlay();
}

function onInspectPin(targets: PreviewInspectTarget[]) {
  addInspectPins(targets);
  persistSidebar(true);
}

const usageBlocked = computed(() => data.value?.usage?.decision.decision === "block");
const usageKind = computed(() => (data.value?.usage ? usageAlertKind(data.value.usage) : null));
const usagePaused = computed(
  () =>
    Boolean(data.value?.flags?.usageLimits) &&
    data.value?.usage?.decision.decision === "block" &&
    usageKind.value === "exhausted",
);
const usageRemainingLabel = computed(() =>
  data.value?.usage ? formatTokens(data.value.usage.remainingTokens, locale.value) : "0",
);
const usageLimitLabel = computed(() =>
  data.value?.usage ? formatTokens(data.value.usage.limitTokens, locale.value) : "0",
);
const usageAlertOpen = computed(() => {
  void usageDismissTick.value;
  if (!clientReady.value) return false;
  const kind = usageKind.value;
  const usage = data.value?.usage;
  const userId = data.value?.user.id;
  if (!kind || !usage || !userId) return false;
  return !isUsageAlertDismissed(usageAlertStorageKey(userId, usage.periodKey, kind));
});

function dismissCreditAlert() {
  const kind = usageKind.value;
  const usage = data.value?.usage;
  const userId = data.value?.user.id;
  if (!kind || !usage || !userId) return;
  dismissUsageAlert(usageAlertStorageKey(userId, usage.periodKey, kind));
  usageDismissTick.value += 1;
}

const usageNotice = computed(() => {
  const usage = data.value?.usage;
  if (!usage) return "";
  if (usageKind.value && usageAlertOpen.value) return "";
  const remaining = usageRemainingLabel.value;
  if (usageKind.value === "exhausted") {
    const reason = usage.decision.reason
      ? t(`usage.reason.${usage.decision.reason}`)
      : t("usage.reason.monthly");
    return t("usage.blocked", { reason });
  }
  if (usageKind.value === "warn") {
    const reason = usage.decision.reason
      ? t(`usage.reason.${usage.decision.reason}`)
      : t("usage.reason.monthly");
    return t("usage.warn", { reason, remaining });
  }
  if (usage.decision.decision === "allow" || !usage.decision.reason) return "";
  const reason = t(`usage.reason.${usage.decision.reason}`);
  return usage.decision.decision === "block"
    ? t("usage.blocked", { reason })
    : t("usage.warn", { reason, remaining });
});

const conversationTitle = computed(() => {
  if (data.value && !data.value.isOwner && data.value.owner?.login) {
    return t("workspace.guestTitle", { owner: data.value.owner.login });
  }
  return data.value?.session?.title || t("workspace.project");
});

function workspaceRoleLabel(role: string | null | undefined) {
  if (role === "spectator") return t("workspace.roleSpectator");
  if (role === "owner") return t("workspace.roleOwner");
  return t("workspace.roleEditor");
}

function onCommand(payload: { type: string; [key: string]: unknown }) {
  void sendCommand(payload as ClientCommand);
}

function onFixDebug(payload?: { action: PreviewDebugAction; sql?: string }) {
  const runtime = lastRuntimeError.value;
  const eventId = runtime && runtime.type === "runtime_error" ? runtime.id : undefined;
  void sendCommand(previewDebugCommand(payload?.action ?? "nplusone", previewDebug.value, t, eventId, payload?.sql));
  sheet.value = null;
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

  <div v-else class="@container flex h-dvh w-full min-w-0 max-w-full flex-col overflow-hidden bg-canvas min-[900px]:flex-row">
    <button
      v-if="railOverlayOpen"
      type="button"
      class="fixed inset-0 z-[65] bg-black/50 min-[1200px]:hidden"
      :aria-label="t('nav.toggleRail')"
      @click="closeRailOverlay"
    />
    <StudioSessionRail
      :data-open="railOverlayOpen || undefined"
      :data-closed="railDockedClosed || undefined"
      :sessions="data.sessions"
      :active-id="data.session?.id"
      :query="query"
      :login="data.user.login"
      :platform-admin="!!data.user.platformAdmin"
      @update:query="query = $event"
      @search="refresh"
      @select="onSelectSession"
      @create="onCreateSession"
      @rules="openSheet('rules')"
      @skills="openSheet('skills')"
      @mcp="openSheet('mcp')"
      @connections="openSheet('connections')"
      @settings="openSheet('settings')"
      @close="closeRail"
    />
    <button
      v-if="sidebarOverride === true"
      type="button"
      class="fixed inset-0 z-40 bg-black/50 min-[900px]:hidden"
      :aria-label="t('workspace.closeChat')"
      @click="persistSidebar(false)"
    />
    <div
      class="min-h-0 min-w-0 flex-col overflow-hidden bg-canvas max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:bottom-12 max-[899px]:left-0 max-[899px]:z-50 max-[899px]:w-full max-[899px]:border-r max-[899px]:border-line max-[899px]:shadow-float min-[900px]:relative min-[900px]:w-[392px] min-[900px]:max-w-[392px] min-[900px]:flex-none"
      :class="sidebarPaneClass"
    >
      <StudioHeader
        :title="conversationTitle"
        :branch="data.workspace.branch"
        :status-label="statusLabel(data.workspace.status)"
        :show-status="data.workspace.status !== 'running'"
        :login="data.owner?.login || data.user.login"
        :presence-count="data.presence.length"
        :presence-label="t('workspace.presence', { count: data.presence.length })"
        :rail-overlay-open="railOverlayOpen"
        :rail-docked-closed="railDockedClosed"
        @invite="dialog = 'invite'"
        @share="dialog = 'share'"
        @toggle-rail="toggleRailOverlay"
        @close-sidebar="persistSidebar(false)"
      />

      <p
        v-if="!data.isOwner"
        class="shrink-0 px-3 pb-2 text-[12px] leading-relaxed text-ink-400"
      >
        {{ t("workspace.guestBanner", { owner: data.owner.login, role: workspaceRoleLabel(data.workspaceRole) }) }}
      </p>

      <div v-if="usageAlertOpen && usageKind" class="shrink-0 px-3 pb-2">
        <StudioUsageAlert
          :kind="usageKind"
          :remaining="usageRemainingLabel"
          :limit="usageLimitLabel"
          :paused="usagePaused"
          @dismiss="dismissCreditAlert"
        />
      </div>

      <div class="flex min-h-0 min-w-0 flex-1">
        <StudioChatPane
          :events="events"
          :sending="sending"
          :show-working="showWorking"
          :working-since="workingSince"
          :failed-event-id="failedEventId"
          :enter-event-id="enterEventId"
          :command-busy="commandBusy"
          :has-alert="usageAlertOpen"
          :session-id="data.session?.id"
          @command="onCommand"
          @suggestion="useSuggestion"
          @fork="newSession"
          @retry="retryFailed"
        >
          <template v-if="usageAlertOpen && usageKind" #alert>
            <StudioUsageAlert
              :kind="usageKind"
              :remaining="usageRemainingLabel"
              :limit="usageLimitLabel"
              :paused="usagePaused"
              @dismiss="dismissCreditAlert"
            />
          </template>
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
            :inspect-pins="inspectPins"
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
            @remove-inspect="removeInspectPin"
            @toggle-spectator="toggleSpectator"
            @drop-queue="dropQueue"
            @update:provider="setProvider"
          />
        </StudioChatPane>
      </div>
    </div>

    <StudioPreviewPane
      class="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden"
      :src="previewSrc"
      :status="data.workspace.status"
      :title="t('workspace.project')"
      :viewport="viewport"
      :rotated="rotated"
      :preview-key="previewKey"
      :tool-mode="toolMode"
      :debug-open="sheet === 'debug'"
      :debug="previewDebug"
      :last-error="data.workspace.lastError"
      :resuming="previewBusy"
      :process-running="data.workspace.previewProcessRunning"
      :can-edit="data.canEdit"
      :can-hibernate="data.canHibernate"
      @update:viewport="viewport = $event"
      @update:rotated="rotated = $event"
      @update:tool-mode="toolMode = $event"
      @update:debug-open="sheet = $event ? 'debug' : sheet === 'debug' ? null : sheet"
      @refresh="previewKey += 1"
      @pin="onInspectPin"
      @resume="resume"
      @hibernate="hibernate"
      @toggle-rail="toggleSidebar"
    />

    <nav class="relative z-[60] grid shrink-0 grid-cols-2 border-t border-line bg-surface min-[900px]:hidden">
      <button
        type="button"
        class="py-2.5 text-[12px]"
        :class="sidebarOverride === true ? 'text-ink-950' : 'text-ink-400'"
        @click="persistSidebar(true)"
      >
        {{ t("workspace.openChat") }}
      </button>
      <button
        type="button"
        class="py-2.5 text-[12px]"
        :class="sidebarOverride === true ? 'text-ink-400' : 'text-ink-950'"
        @click="persistSidebar(false)"
      >
        {{ t("workspace.openPreview") }}
      </button>
    </nav>

    <StudioOverlays
      :data="data"
      :sheet="sheet"
      :dialog="dialog"
      :link-url="linkUrl"
      :link-busy="linkBusy"
      :invite-role="inviteRole"
      :invite-members="inviteMembers"
      :pending-invites="pendingInvites"
      :invite-panel-busy="invitePanelBusy"
      :palette-query="paletteQuery"
      :commands="commands"
      :filtered-commands="filteredCommands"
      :pending-plan="pendingPlan"
      :pending-question="pendingQuestion"
      :pending-permission="pendingPermission"
      :question-answers="questionAnswers"
      :toast="toast"
      :debug="previewDebug"
      :debug-pending="previewBusy && !previewDebug"
      :debug-error="data.workspace.lastError"
      :has-runtime-error="Boolean(lastRuntimeError)"
      :command-busy="commandBusy"
      @update:sheet="sheet = $event"
      @update:dialog="dialog = $event"
      @update:palette-query="paletteQuery = $event"
      @command="onCommand"
      @save-user-rule="saveUserRule"
      @delete-user-rule="deleteUserRule"
      @save-user-env="saveUserEnv"
      @save-user-skill="saveUserSkill"
      @delete-user-skill="deleteUserSkill"
      @save-user-mcp="saveUserMcp($event.name, $event.config)"
      @delete-user-mcp="deleteUserMcp"
      @toggle-skill="toggleSkill($event.name, $event.enabled)"
      @toggle-mcp="toggleMcp($event.name, $event.enabled)"
      @copy-invite="copyLink('invite')"
      @create-invite="createInviteLink"
      @revoke-invite="revokeInvite"
      @copy-pending-invite="copyPendingInvite"
      @remove-member="removeMember"
      @leave-workspace="leaveWorkspace"
      @update:invite-role="inviteRole = $event"
      @copy-share="copyLink('share')"
      @hibernate="hibernate"
      @sync="sendCommand({ type: 'sync_base' })"
      @update:question-answers="questionAnswers = $event"
      @debug-action="onFixDebug"
    />
  </div>
</template>
