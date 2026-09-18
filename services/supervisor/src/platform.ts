import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type {
  ClientCommand,
  CursorCliAccount,
  ProviderId,
  ProviderKeyState,
  ProviderModel,
  Role,
  SessionEvent,
  UsageProfile,
  UsageSummary,
  Viewport,
  WorkspaceMemberRole,
} from "@atelier/contracts";
import { UsageProfileSchema } from "@atelier/contracts";
import {
  applyFileDecision,
  applyHunkDecision,
  budgetExceeded,
  canEditWorkspaceAccess,
  canManageWorkspaceAccess,
  canViewWorkspaceAccess,
  canTransition,
  adminLoginsFromEnv,
  isPermanentPlatformAdmin,
  isWorkspaceMemberRole,
  sameLogin,
  adminRules,
  compileRules,
  isRuleSlug,
  normalizeRule,
  rulesForActor,
  storedRules,
  defaultBudget,
  defaultDiskPolicy,
  defaultFlags,
  evaluatePermission,
  foldEvents,
  sessionEventKey,
  upsertSessionEvent,
  isFlagOn,
  resolveSandboxProfile,
  isPlatformAdmin as matchPlatformAdmin,
  mapGitHubPermission,
  packPrompt,
  promptPrefixForMode,
  estimateTokens,
  reduceSession,
  shouldCollect,
  shouldHibernate,
  shouldResetToReadyOnWarm,
  titleFromPrompt,
  withInspectPrompt,
  transition,
  slashInvocation,
  mcpFingerprint,
  parseMcpConfig,
  serializeMcpConfig,
  mcpPolicyDecision,
  restoreRedactedMcp,
  redactMcpEntry,
  isSkillName,
  isSecretMcpKey,
  moveProviderKey,
  nextProviderKeyRef,
  resetProviderKey,
  canAcquireLease,
  createLease,
  heartbeatLease,
  currentRequestText,
  mentionFileHint,
  mentionPromptText,
  classifyMention,
  permissionRequestFromTitle,
  hasPendingProposal,
  selectValidationCommands,
  summarizeValidation,
  defaultUsageProfileId,
  defaultUsageProfiles,
  emptyCursorCliAccount,
  emptyProviderKeyState,
  isCursorCliAccountUsable,
  isCursorCliLoggedOut,
  isProviderKeyFailure,
  isProviderKeyUsable,
  markCursorCliLoggedOut,
  markProviderKeyFailure,
  markProviderKeySuccess,
  mergeRollups,
  moveCursorCliAccount,
  nextCursorCliAccountId,
  parseCursorCliAuthRef,
  normalizeUsageProfile,
  resolveUsageProfile,
  rollupFromEntries,
  splitExpiredEntries,
  summarizeUsage,
  usagePeriodKey,
  usageRetentionDays,
  usageTimezone,
  type McpEntry,
  type UsageLedgerEntry,
  type WorkspaceAccessRole,
} from "@atelier/domain";
import { bus } from "./bus.js";
import { type PlatformStore, type ProviderConfig, type RuleRecord, type SessionRecord, type UserRecord, type WorkspaceMemberRecord, type WorkspaceRecord } from "./store.js";
import { createPlatformStore } from "./store-factory.js";
import { hasCursorApiKey, implementedProviders, preferredAgentProvider, resolveSessionProvider, cursorAgentEnv } from "./providers/env.js";
import { hydrateProviderKeys, isProviderKeyRef, listProviderCredentials, providerCredentialCandidates, providerSecretKey } from "./providers/credentials.js";
import { inspectProviderHealth, isProviderSelectable, listProviderHealth } from "./providers/health.js";
import { probeCursorApiKeys as runCursorApiKeyProbes, probeCursorCliAccounts as runCursorCliProbes, defaultCursorProbeRun } from "./providers/cursor-probe.js";
import {
  CursorCliLoginLock,
  cursorAuthCandidates,
  ensureCursorAccountHome,
  migrateLegacyCursorHome,
  removeCursorAccountHome,
  seedDefaultCursorCliAccount,
  spawnCursorLoginAcp,
  type CursorAuthCandidate,
} from "./providers/cursor-cli.js";
import { ensureCursorAgent, findCursorAgentBinary } from "./providers/ensure-agent.js";
import { createProvider, listProviders as catalogProviders } from "./providers/index.js";
import { mergeProviderModels, providerModelCatalog } from "./providers/models.js";
import { PROVIDER_CATALOG, type AgentProvider } from "./providers/types.js";
import { fixtureAppDir } from "./paths.js";
import { applyPatchHunkToWorktree, DockerRuntime, ProcessRuntime, type WorkspaceRuntime } from "./runtime/process.js";
import { worktreeDivergence } from "./migrations.js";
import { defaultWorkspaceSpec, isolationEnv, PREVIEW_SIDE_EFFECTS, validateEnvContract } from "./runtime/spec.js";
import {
  atelierPublicUrl,
  githubAppRepo,
  githubRepoOwnerLogin,
  hasGitHubOAuth,
  loadGitHubAppCredentials,
} from "./github-app.js";
import { resolveInstallationToken } from "./github.js";
import { isForeignWorktree } from "./runtime/clone.js";
import {
  connectionsFromWorktree,
  defaultConnectionPort,
  envKeyOrigin,
  mergeWorktreeEnv,
  parseEnvFile,
  readEnvFile,
  readGlobalEnv,
  readProviderSecrets,
  readUserEnv,
  pickSecretEnv,
  redactEnv,
  restoreRedactedEnv,
  seedGlobalEnvDraft,
  serializeEnvFile,
  writeGlobalEnv,
  writeProviderSecrets,
  writeUserEnv,
} from "./runtime/env-file.js";
import { probeConnections } from "./runtime/connection-probe.js";
import { mentionIndexFromWorktree, worktreeBytes } from "./runtime/worktree-meta.js";
import { clearPreviewError, readPreviewLogs, suggestPreviewFixes, writePreviewLogs } from "./runtime/preview-logs.js";
import { startSpan, recordUsage } from "./otel.js";
import {
  costDelta,
  createRunMeter,
  estimatePromptBlockTokens,
  ledgerEntryFromMeter,
  meterBillableTokens,
  meterEstimatedTokens,
  meterSessionEvent,
  UsageLimitError,
  type RunMeter,
} from "./usage.js";
import {
  commitWorktree,
  createProposalCommit,
  pushStudioBranch,
  restoreCheckpoint,
  restoreFile,
  restoreProposalFiles,
  syncBaseBranch,
  worktreeDiffEvents,
  worktreeFileStates,
  worktreeFingerprint,
  changedWorktreePaths,
} from "./runtime/worktree-diff.js";
import { formatAgentError } from "./acp/errors.js";
import { PromptTextBuffer, shouldFlushAssistantText } from "./acp/prompt-text.js";
import type { AcpPromptBlock } from "./acp/session.js";
import type { ProviderRun } from "./providers/types.js";
import { runValidationCommand } from "./runtime/validation-run.js";
import {
  collectSkills,
  deleteSkillFile,
  globalSkillsDir,
  materializeSkills,
  seedGlobalSkills,
  userSkillsDir,
  writeSkillFile,
} from "./skills/layers.js";
import {
  acpServersForWorktree,
  collectMcp,
  mergeWorktreeMcp,
  readMcpPolicy,
  readPlatformMcp,
  readUserMcp,
  writeMcpPolicy,
  writePlatformMcp,
  writeUserMcp,
} from "./mcp/layers.js";

export class Platform {
  readonly store: PlatformStore;
  readonly runtime: WorkspaceRuntime;
  private readonly runs = new Map<string, ProviderRun>();
  private readonly runModes = new Map<string, "agent" | "plan" | "ask">();
  private readonly runFingerprints = new Map<string, string>();
  private readonly pendingPermissions = new Map<string, { rpcId: number; respond: ProviderRun["respondPermission"] }>();
  private readonly promptText = new PromptTextBuffer();
  private readonly workspaceQueue = new Map<string, Promise<unknown>>();
  private readonly runMeters = new Map<string, {
    meter: RunMeter;
    profile: UsageProfile;
    enforce: boolean;
    periodTokens: number;
    limitTokens: number;
  }>();
  private readonly runKeyRefs = new Map<string, string>();
  private readonly promptTouched = new Set<string>();
  private readonly cliLogin = new CursorCliLoginLock();

  constructor(
    store: PlatformStore = createPlatformStore(),
    private readonly providerFactory: (id: ProviderId) => AgentProvider = createProvider,
  ) {
    this.store = store;
    this.runtime = process.env.ATELIER_RUNTIME === "docker" ? new DockerRuntime() : new ProcessRuntime();
  }

  flags() {
    return { ...defaultFlags, ...this.store.read().flags };
  }

  envRoot(): string {
    return join(dirname(this.store.path), "env");
  }

  storeDir(): string {
    return dirname(this.store.path);
  }

  hasExplicitAdmin(): boolean {
    const db = this.store.read();
    return db.users.some((user) => typeof user.platformAdmin === "boolean") || adminLoginsFromEnv().length > 0;
  }

  repoOwnerLogin(): string {
    return githubRepoOwnerLogin();
  }

  isRepoOwner(user: UserRecord): boolean {
    return isPermanentPlatformAdmin(user.login, this.repoOwnerLogin());
  }

  canDisableUser(user: UserRecord): boolean {
    if (this.isRepoOwner(user)) return false;
    if (adminLoginsFromEnv().some((login) => sameLogin(login, user.login))) return false;
    return true;
  }

  assertCanDisable(user: UserRecord): void {
    if (this.isRepoOwner(user)) throw new Error("Cannot disable the permanent platform admin");
    if (adminLoginsFromEnv().some((login) => sameLogin(login, user.login))) {
      throw new Error("Cannot disable an env-listed admin");
    }
  }

  isPlatformAdmin(user: UserRecord): boolean {
    const row = this.store.read().users.find((item) => item.id === user.id) ?? user;
    return matchPlatformAdmin(row, {
      envLogins: adminLoginsFromEnv(),
      repoOwnerLogin: this.repoOwnerLogin(),
    });
  }

  listProviders() {
    const flags = this.flags();
    const enabled = this.providerConfig();
    const implemented = implementedProviders();
    const canaryOk = !isFlagOn(flags, "providerCanary") || process.env.ATELIER_PROVIDER_CANARY === "1";
    return catalogProviders()
      .filter((provider) => {
        if (!implemented.includes(provider.id)) return false;
        if (provider.id === "mock") return Boolean(process.env.VITEST);
        if (provider.id === "cursor") return enabled.cursor?.enabled !== false;
        if (!canaryOk) return false;
        if (enabled[provider.id]?.enabled !== true) return false;
        return isProviderSelectable(provider.id, flags, process.env, this.envRoot(), this.providerRoster(provider.id));
      })
      .map((provider) => {
        const model = enabled[provider.id]?.model?.trim();
        return model ? { ...provider, model } : provider;
      });
  }

  roleFor(user: UserRecord, projectId = "concreserv"): Role {
    return this.store.read().members.find((m) => m.userId === user.id && m.projectId === projectId)?.role ?? user.role;
  }

  workspaceAccessRole(user: UserRecord, workspace: WorkspaceRecord): WorkspaceAccessRole | null {
    if (workspace.userId === user.id) return "owner";
    const member = this.store
      .read()
      .workspaceMembers.find((row) => row.workspaceId === workspace.id && row.userId === user.id);
    if (member) return member.role;
    if (this.isPlatformAdmin(user)) return "editor";
    return null;
  }

  canAccessWorkspace(user: UserRecord, workspace: WorkspaceRecord, mode: "view" | "edit"): boolean {
    if (user.disabled) return false;
    const role = this.workspaceAccessRole(user, workspace);
    return mode === "edit" ? canEditWorkspaceAccess(role) : canViewWorkspaceAccess(role);
  }

  canManageWorkspace(user: UserRecord, workspace: WorkspaceRecord): boolean {
    if (user.disabled) return false;
    return canManageWorkspaceAccess(workspace.userId === user.id, this.isPlatformAdmin(user));
  }

  canCreateInvite(user: UserRecord, workspaceId?: string): boolean {
    if (!workspaceId) return this.isPlatformAdmin(user);
    const ws = this.store.read().workspaces.find((row) => row.id === workspaceId);
    if (!ws || ws.status === "destroyed") return false;
    return this.canManageWorkspace(user, ws);
  }

  publicPreviewUrl(token: string): string {
    return `${atelierPublicUrl().replace(/\/$/, "")}/-/p/${token}`;
  }

  async loginDev(login: string, locale: "en" | "pt-BR" = "pt-BR"): Promise<UserRecord> {
    const db = this.store.read();
    let user = db.users.find((u) => u.login === login);
    if (!user) {
      user = {
        id: randomUUID(),
        login,
        name: login,
        email: `${login}@users.noreply.github.com`,
        locale,
        role: "owner",
      };
      this.store.update((d) => {
        d.users.push(user!);
        d.members.push({ userId: user!.id, projectId: "concreserv", role: user!.role });
      });
    } else {
      this.syncMembership(user);
    }
    const stored = this.store.read().users.find((row) => row.id === user.id) ?? user;
    if (stored.disabled) return stored;
    try {
      await this.warmForUser(stored);
    } catch (error) {
      // Local login is allowed without GitHub App credentials; opening a workspace still clones.
      if (process.env.VITEST) throw error;
    }
    return stored;
  }

  syncMembership(user: UserRecord): void {
    this.store.update((d) => {
      const row = d.users.find((u) => u.id === user.id);
      const role = row?.role ?? user.role;
      const member = d.members.find((m) => m.userId === user.id && m.projectId === "concreserv");
      if (member) member.role = role;
      else d.members.push({ userId: user.id, projectId: "concreserv", role });
    });
  }

  authorizeGitHub(permissions: Parameters<typeof mapGitHubPermission>[0]): Role | null {
    return mapGitHubPermission(permissions);
  }

  async ensureWorkspace(user: UserRecord): Promise<WorkspaceRecord> {
    const db = this.store.read();
    let ws = db.workspaces.find((w) => w.userId === user.id && w.status !== "destroyed");
    const repo = githubAppRepo();
    if (ws && (await isForeignWorktree(ws.worktree, repo))) {
      await this.runtime.destroy(ws.id);
      this.store.update((d) => {
        const row = d.workspaces.find((w) => w.id === ws!.id);
        if (row) {
          row.status = "destroyed";
          row.desired = "destroyed";
        }
      });
      ws = undefined;
    }
    if (ws) return ws;
    const id = randomUUID();
    const branch = `user/${user.login}/studio`;
    const creds = loadGitHubAppCredentials();
    const token = await resolveInstallationToken({
      appId: creds?.appId,
      privateKey: creds?.privateKey,
      installationId: creds?.installationId,
    });
    if (!token && !process.env.VITEST) {
      throw new Error("GitHub App credentials (app id, private key, installation id) are required to clone ticoncreserv/app");
    }
    const { worktree } = await this.runtime.provision({
      workspaceId: id,
      branch,
      repo,
      token: process.env.VITEST ? undefined : token ?? undefined,
      sourceDir: process.env.VITEST ? fixtureAppDir() : undefined,
      user: { name: user.name, email: user.email },
      userId: user.id,
      envRoot: this.envRoot(),
    });
    this.materializeRules(worktree, user.locale, this.rulesForWorktree(user.id));
    this.materializeWorkspaceTools(worktree, user.id);
    const bytes = await worktreeBytes(worktree);
    ws = {
      id,
      projectId: "concreserv",
      userId: user.id,
      branch,
      status: "ready",
      desired: "ready",
      previewToken: randomBytes(12).toString("hex"),
      worktree,
      lastActiveAt: new Date().toISOString(),
      bytes,
    };
    this.store.update((d) => d.workspaces.push(ws!));
    mergeWorktreeEnv(
      worktree,
      {
        ...PREVIEW_SIDE_EFFECTS,
        ...isolationEnv(id, this.publicPreviewUrl(ws.previewToken)),
        APP_URL: this.publicPreviewUrl(ws.previewToken),
      },
      { userId: user.id, envRoot: this.envRoot() },
    );
    return ws;
  }

  async sweepForeignWorktrees(): Promise<void> {
    const repo = githubAppRepo();
    for (const ws of this.store.read().workspaces) {
      if (ws.status === "destroyed") continue;
      if (!(await isForeignWorktree(ws.worktree, repo))) continue;
      await this.runtime.destroy(ws.id);
      this.store.update((d) => {
        const row = d.workspaces.find((w) => w.id === ws.id);
        if (row) {
          row.status = "destroyed";
          row.desired = "destroyed";
        }
      });
    }
  }

  async wakePreview(workspaceId: string): Promise<WorkspaceRecord> {
    this.store.update((d) => {
      const row = d.workspaces.find((w) => w.id === workspaceId);
      if (row) row.hibernatedByUser = false;
    });
    const ws = this.requireWorkspace(workspaceId);
    const needsVite = existsSync(join(ws.worktree, "package.json"));
    if (this.runtime.isRunning(workspaceId) && ws.status === "running" && ws.port && (!needsVite || ws.vitePort)) {
      return ws;
    }
    return this.startPreview(workspaceId);
  }

  async warmForUser(user: UserRecord): Promise<WorkspaceRecord> {
    const ws = await this.ensureWorkspace(user);
    this.store.update((d) => {
      const row = d.workspaces.find((w) => w.id === ws.id);
      if (!row) return;
      row.warmedAt = new Date().toISOString();
      if (!shouldResetToReadyOnWarm(row)) return;
      row.status = "ready";
      row.desired = "ready";
    });
    return this.requireWorkspace(ws.id);
  }

  async startPreview(workspaceId: string): Promise<WorkspaceRecord> {
    const ws = this.requireWorkspace(workspaceId);
    try {
      const handle = await this.runtime.start({
        workspaceId,
        worktree: ws.worktree,
        publicUrl: this.publicPreviewUrl(ws.previewToken),
        hmr: true,
        userId: ws.userId,
        envRoot: this.envRoot(),
      });
      this.store.update((d) => {
        const row = d.workspaces.find((w) => w.id === workspaceId)!;
        const from =
          row.status === "running" || row.status === "ready" || row.status === "hibernated" || row.status === "error"
            ? row.status
            : "ready";
        row.status = from === "running" ? "running" : transition(from, "running");
        row.desired = "running";
        row.hibernatedByUser = false;
        row.port = handle.port;
        row.vitePort = handle.vitePort;
        row.lastError = undefined;
        row.errorAt = undefined;
        row.lastActiveAt = new Date().toISOString();
      });
    } catch (error) {
      await this.runtime.hibernate(workspaceId).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      writePreviewLogs(workspaceId, { error: message }, this.envRoot());
      this.store.update((d) => {
        const row = d.workspaces.find((w) => w.id === workspaceId);
        if (!row) return;
        row.status = "error";
        row.desired = "running";
        row.port = undefined;
        row.vitePort = undefined;
        row.lastError = message;
        row.errorAt = new Date().toISOString();
      });
      throw error;
    }
    return this.requireWorkspace(workspaceId);
  }

  async hibernate(workspaceId: string, options: { byUser?: boolean } = {}): Promise<WorkspaceRecord> {
    const ws = this.requireWorkspace(workspaceId);
    await this.runtime.hibernate(workspaceId, { port: ws.port, vitePort: ws.vitePort });
    for (const session of this.sessions(workspaceId)) {
      this.runs.get(session.id)?.stop();
      this.runs.delete(session.id);
    }
    this.store.update((d) => {
      const row = d.workspaces.find((w) => w.id === workspaceId);
      if (!row) return;
      if (row.status !== "hibernated" && row.status !== "destroyed") {
        row.status = canTransition(row.status, "hibernated") ? transition(row.status, "hibernated") : "hibernated";
        row.desired = "hibernated";
      }
      if (options.byUser) row.hibernatedByUser = true;
      row.port = undefined;
      row.vitePort = undefined;
    });
    return this.requireWorkspace(workspaceId);
  }

  reconcile(): void {
    const policy = defaultDiskPolicy();
    const now = Date.now();
    const db = this.store.read();
    for (const ws of db.workspaces) {
      if (ws.status === "destroyed") continue;
      const idle = now - new Date(ws.lastActiveAt).getTime();
      if (ws.status === "running" && shouldHibernate(idle, policy)) {
        void this.hibernate(ws.id);
      } else if (shouldCollect(idle, policy)) {
        void this.runtime.destroy(ws.id);
        this.store.update((d) => {
          const row = d.workspaces.find((w) => w.id === ws.id);
          if (row) {
            row.status = "destroyed";
            row.desired = "destroyed";
          }
        });
      }
    }
    this.pruneUsageLedger(new Date(now));
  }

  sessions(workspaceId: string, query?: string): SessionRecord[] {
    const list = this.store.read().sessions.filter((s) => s.workspaceId === workspaceId);
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((s) => s.title.toLowerCase().includes(q) || s.events.some((e) => "text" in e && String(e.text).toLowerCase().includes(q)));
  }

  setSessionProvider(sessionId: string, provider: ProviderId): SessionRecord {
    const available = this.listProviders().some((row) => row.id === provider);
    if (!available) throw new Error(`Provider ${provider} is not available`);
    this.store.update((d) => {
      const session = d.sessions.find((s) => s.id === sessionId);
      if (session) session.provider = provider;
    });
    const session = this.store.read().sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found");
    return session;
  }

  preferredProvider(): ProviderId {
    return preferredAgentProvider();
  }

  createSession(workspaceId: string, provider: ProviderId = preferredAgentProvider()): SessionRecord {
    const available = this.listProviders().some((row) => row.id === provider);
    if (!available) throw new Error(`Provider ${provider} is not available`);
    const session: SessionRecord = {
      id: randomUUID(),
      workspaceId,
      title: "Untitled session",
      events: [],
      provider,
      createdAt: new Date().toISOString(),
    };
    this.store.update((d) => d.sessions.push(session));
    return session;
  }

  append(sessionId: string, event: SessionEvent): void {
    const db = this.store.read();
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (event.type === "assistant_delta" || event.type === "available_skills") {
      bus.publish({ ...event, sessionId, workspaceId: session.workspaceId });
      return;
    }
    const next = upsertSessionEvent(session.events, event);
    const published = next.find((row) => sessionEventKey(row) === sessionEventKey(event)) ?? event;
    session.events = next;
    this.store.write(db);
    bus.publish({ ...published, sessionId, workspaceId: session.workspaceId });
  }

  private flushPromptText(sessionId: string): void {
    const text = this.promptText.take(sessionId);
    if (!text) return;
    this.append(sessionId, {
      type: "assistant_message",
      id: randomUUID(),
      at: new Date().toISOString(),
      text,
      streaming: false,
    });
  }

  snapshot(sessionId: string) {
    const session = this.store.read().sessions.find((s) => s.id === sessionId);
    if (!session) return foldEvents([]);
    return foldEvents(session.events);
  }

  async handleCommand(input: {
    user: UserRecord;
    sessionId: string;
    command: ClientCommand;
    spectator?: boolean;
  }): Promise<void> {
    const session = this.store.read().sessions.find((s) => s.id === input.sessionId);
    if (!session) throw new Error("Session not found");
    const ws = this.requireWorkspace(session.workspaceId);
    if (!this.canAccessWorkspace(input.user, ws, "view")) throw new Error("Forbidden");

    const presence = this.store.read().presence.find((p) => p.workspaceId === ws.id && p.userId === input.user.id);
    const canWrite = canEditWorkspaceAccess(this.workspaceAccessRole(input.user, ws));
    const spectator = Boolean(input.spectator || presence?.mode === "spectator" || !canWrite);
    if (spectator && input.command.type === "prompt") {
      throw new Error("Spectators cannot send prompts");
    }
    if (spectator && input.command.type !== "prompt") return;

    if (input.command.type === "prompt") {
      const prompt = input.command;
      this.assertUsageAllowed(input.user, session, prompt);
      this.queuePrompt(ws.id, () => this.runPrompt(input.user, session, ws, prompt));
      return;
    }
    if (input.command.type === "cancel") {
      await this.runs.get(session.id)?.cancel();
      this.append(session.id, {
        type: "run",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        runId: session.id,
        status: "cancelled",
      });
      return;
    }
    if (input.command.type === "accept_hunk" || input.command.type === "reject_hunk") {
      const hunkId = input.command.hunkId;
      const accepted = input.command.type === "accept_hunk";
      await this.enqueueWorkspace(ws.id, async () => {
        const state = this.snapshot(session.id);
        const hunk = state.hunks.find((h) => h.id === hunkId);
        if (hunk) applyPatchHunkToWorktree(ws.worktree, hunk, accepted ? "forward" : "reverse");
        this.mutateHunks(session.id, (next) => applyHunkDecision(next, hunkId, accepted ? "accepted" : "rejected"));
        await this.maybeFinalizeProposal(input.user, session, ws);
      });
      return;
    }
    if (input.command.type === "accept_file" || input.command.type === "reject_file") {
      const filePath = input.command.filePath;
      const accepted = input.command.type === "accept_file";
      await this.enqueueWorkspace(ws.id, async () => {
        const state = this.snapshot(session.id);
        if (accepted) {
          for (const hunk of state.hunks.filter((item) => item.filePath === filePath)) {
            applyPatchHunkToWorktree(ws.worktree, hunk, "forward");
          }
        } else {
          await restoreFile(ws.worktree, filePath, this.restoreRev(session));
        }
        this.mutateHunks(session.id, (next) => applyFileDecision(next, filePath, accepted ? "accepted" : "rejected"));
        await this.maybeFinalizeProposal(input.user, session, ws);
      });
      return;
    }
    if (input.command.type === "discard_proposal") {
      await this.enqueueWorkspace(ws.id, async () => {
        const proposal = this.snapshot(session.id).proposal;
        if (proposal) await restoreProposalFiles(ws.worktree, proposal.files, proposal.baseSha);
        this.mutateHunks(session.id, (state) => ({
          ...state,
          hunks: state.hunks.map((hunk) => ({ ...hunk, status: "rejected" as const })),
        }));
        this.append(session.id, {
          type: "run",
          id: randomUUID(),
          at: new Date().toISOString(),
          v: 1,
          runId: proposal?.runId ?? session.id,
          status: "rejected",
          reason: "proposal discarded",
        });
      });
      return;
    }
    if (input.command.type === "push_studio") {
      await this.enqueueWorkspace(ws.id, async () => {
        const creds = loadGitHubAppCredentials();
        const token = await resolveInstallationToken({
          appId: creds?.appId,
          privateKey: creds?.privateKey,
          installationId: creds?.installationId,
        });
        const result = await pushStudioBranch(ws.worktree, { name: input.user.name, email: input.user.email }, token ?? undefined);
        this.append(session.id, {
          type: "push",
          id: randomUUID(),
          at: new Date().toISOString(),
          v: 1,
          remote: result.remote,
          sha: result.sha,
          status: result.status,
          message: result.message,
        });
      });
      return;
    }
    if (input.command.type === "sync_base") {
      await this.enqueueWorkspace(ws.id, async () => {
        const creds = loadGitHubAppCredentials();
        const token = await resolveInstallationToken({
          appId: creds?.appId,
          privateKey: creds?.privateKey,
          installationId: creds?.installationId,
        });
        const result = await syncBaseBranch(ws.worktree, { name: input.user.name, email: input.user.email }, token ?? undefined);
        this.append(session.id, {
          type: "conflict",
          id: randomUUID(),
          at: new Date().toISOString(),
          files: result.files,
          message: result.message,
        });
      });
      return;
    }
    if (input.command.type === "fix_error") {
      const lastError = [...session.events].reverse().find((e) => e.type === "runtime_error");
      const eventId = input.command.eventId;
      this.queuePrompt(ws.id, () =>
        this.runPrompt(input.user, session, ws, {
          type: "prompt",
          text: `Fix this preview error: ${lastError && lastError.type === "runtime_error" ? lastError.message : eventId}`,
          attachments: [],
          mentions: [],
        }),
      );
      return;
    }
    if (input.command.type === "restore_checkpoint") {
      const command = input.command;
      await this.enqueueWorkspace(ws.id, async () => {
        const current = this.store.read().sessions.find((s) => s.id === session.id) ?? session;
        const checkpoint = current.events.find((e) => e.type === "checkpoint" && e.id === command.checkpointId);
        const sha = checkpoint && checkpoint.type === "checkpoint" ? checkpoint.gitSha : command.checkpointId;
        await restoreCheckpoint(ws.worktree, sha, { name: input.user.name, email: input.user.email });
        this.append(session.id, {
          type: "checkpoint",
          id: randomUUID(),
          at: new Date().toISOString(),
          gitSha: sha,
          label: `Restored ${sha.slice(0, 8)}`,
        });
      });
      return;
    }
    if (input.command.type === "decide_plan") {
      const outcome = input.command.outcome;
      this.patchSessionEvent(
        session.id,
        (event) => (event.type === "plan" && event.outcome === "pending" ? { ...event, outcome } : event),
      );
      if (outcome === "accepted") {
        this.queuePrompt(ws.id, () =>
          this.runPrompt(input.user, session, ws, {
            type: "prompt",
            text: "The plan was accepted. Continue implementing it.",
            attachments: [],
            mentions: [],
          }),
        );
      }
      return;
    }
    if (input.command.type === "decide_permission") {
      const outcome = input.command.outcome;
      const pending = this.pendingPermissions.get(session.id);
      pending?.respond?.(pending.rpcId, outcome);
      this.pendingPermissions.delete(session.id);
      this.patchSessionEvent(
        session.id,
        (event) => (event.type === "permission" && event.outcome === "pending" ? { ...event, outcome } : event),
      );
      return;
    }
    if (input.command.type === "answer_question") {
      const answers = input.command.answers;
      this.patchSessionEvent(
        session.id,
        (event) => (event.type === "question" ? { ...event, outcome: "answered" } : event),
      );
      this.queuePrompt(ws.id, () =>
        this.runPrompt(input.user, session, ws, {
          type: "prompt",
          text: `Question answers: ${JSON.stringify(answers)}`,
          attachments: [],
          mentions: [],
        }),
      );
    }
  }

  private patchSessionEvent(sessionId: string, patch: (event: SessionEvent) => SessionEvent): void {
    let published: SessionEvent | undefined;
    let workspaceId: string | undefined;
    this.store.update((d) => {
      const s = d.sessions.find((x) => x.id === sessionId);
      if (!s) return;
      workspaceId = s.workspaceId;
      s.events = s.events.map((event) => {
        const next = patch(event);
        if (next !== event) published = next;
        return next;
      });
    });
    if (published && workspaceId) bus.publish({ ...published, sessionId, workspaceId });
  }

  private queuePrompt(workspaceId: string, fn: () => Promise<void>): void {
    void this.enqueueWorkspace(workspaceId, fn).catch(() => undefined);
  }

  async flushWorkspace(workspaceId: string): Promise<void> {
    await this.workspaceQueue.get(workspaceId);
  }

  private mutateHunks(sessionId: string, fn: (state: ReturnType<typeof foldEvents>) => ReturnType<typeof foldEvents>) {
    const session = this.store.read().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const next = fn(foldEvents(session.events));
    this.store.update((d) => {
      const s = d.sessions.find((x) => x.id === sessionId)!;
      s.events = s.events.map((e) => {
        if (e.type !== "diff") return e;
        return { ...e, hunks: next.hunks.filter((h) => h.filePath === e.filePath) };
      });
    });
  }

  private async enqueueWorkspace<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
    if (!isFlagOn(this.flags(), "workspaceQueue")) {
      const work = fn();
      const previous = this.workspaceQueue.get(workspaceId) ?? Promise.resolve();
      this.workspaceQueue.set(
        workspaceId,
        Promise.all([previous, Promise.resolve(work)]).then(
          () => undefined,
          () => undefined,
        ),
      );
      return work;
    }
    const previous = this.workspaceQueue.get(workspaceId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    this.workspaceQueue.set(
      workspaceId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private async maybeFinalizeProposal(user: UserRecord, session: SessionRecord, ws: WorkspaceRecord) {
    if (!isFlagOn(this.flags(), "transactionalReview")) return;
    const state = this.snapshot(session.id);
    if (hasPendingProposal(state.hunks) || !state.proposal) return;
    const rejectedAll = state.hunks.length > 0 && state.hunks.every((hunk) => hunk.status === "rejected");
    if (rejectedAll) {
      await restoreProposalFiles(ws.worktree, state.proposal.files, state.proposal.baseSha);
      this.append(session.id, {
        type: "run",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        runId: state.proposal.runId,
        status: "rejected",
      });
      return;
    }
    await this.commitAcceptedChanges(user, session, ws, state.proposal.runId, state.proposal.files);
  }

  private async commitAcceptedChanges(
    user: UserRecord,
    session: SessionRecord,
    ws: WorkspaceRecord,
    runId: string,
    files: string[],
  ) {
    if (isFlagOn(this.flags(), "validationGate") && !process.env.VITEST) {
      this.append(session.id, {
        type: "run",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        runId,
        status: "validating",
      });
      const results = [];
      for (const command of selectValidationCommands(files)) {
        const result = await runValidationCommand(ws.worktree, command);
        results.push(result);
        this.append(session.id, {
          type: "validation",
          id: randomUUID(),
          at: new Date().toISOString(),
          v: 1,
          runId,
          status: result.code === 0 ? (result.output.startsWith("skipped:") ? "skipped" : "passed") : "failed",
          command: `${command.command} ${command.args.join(" ")}`,
          output: result.output,
          durationMs: result.durationMs,
        });
      }
      if (summarizeValidation(results) === "failed") {
        this.append(session.id, {
          type: "run_failure",
          id: randomUUID(),
          at: new Date().toISOString(),
          v: 1,
          kind: "validation_failed",
          message: "Validation failed; the accepted tree was not committed.",
        });
        return;
      }
    }
    const sha = await commitWorktree(ws.worktree, { name: user.name, email: user.email }, titleFromPrompt(session.title), files);
    if (sha) {
      this.append(session.id, {
        type: "checkpoint",
        id: randomUUID(),
        at: new Date().toISOString(),
        gitSha: sha,
        label: session.title,
      });
      this.append(session.id, {
        type: "run",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        runId,
        status: "accepted",
      });
    }
    if (sha && isFlagOn(this.flags(), "autoPush")) {
      const creds = loadGitHubAppCredentials();
      const token = await resolveInstallationToken({
        appId: creds?.appId,
        privateKey: creds?.privateKey,
        installationId: creds?.installationId,
      });
      const result = await pushStudioBranch(ws.worktree, { name: user.name, email: user.email }, token ?? undefined);
      this.append(session.id, {
        type: "push",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        remote: result.remote,
        sha: result.sha,
        status: result.status,
        message: result.message,
      });
      if (result.status === "pushed") {
        this.append(session.id, {
          type: "run",
          id: randomUUID(),
          at: new Date().toISOString(),
          v: 1,
          runId,
          status: "pushed",
        });
      }
    }
    const bytes = await worktreeBytes(ws.worktree);
    this.store.update((d) => {
      const row = d.workspaces.find((w) => w.id === ws.id);
      if (row) row.bytes = bytes;
    });
  }

  /** Runs before the workspace queue so a blocked prompt never spawns a provider. */
  private assertUsageAllowed(
    user: UserRecord,
    session: SessionRecord,
    command: Extract<ClientCommand, { type: "prompt" }>,
  ): void {
    if (!isFlagOn(this.flags(), "usageLimits")) return;
    const pendingTokens = estimateTokens(command.text) + estimateTokens((command.inspect ?? []).map((pin) => pin.note).join("\n")) + command.mentions.length * 256;
    const summary = this.usageSummary(user.id, {
      pendingTokens,
      provider: resolveSessionProvider(session.provider),
    });
    if (summary.decision.decision !== "block") return;
    this.append(session.id, {
      type: "budget",
      id: randomUUID(),
      at: new Date().toISOString(),
      reason: "period",
      message: `Prompt blocked: ${summary.decision.reason} token limit reached`,
    });
    this.append(session.id, {
      type: "run",
      id: randomUUID(),
      at: new Date().toISOString(),
      v: 1,
      runId: session.id,
      status: "rejected",
      reason: `usage:${summary.decision.reason}`,
    });
    throw new UsageLimitError(summary);
  }

  private async runPrompt(
    user: UserRecord,
    session: SessionRecord,
    ws: WorkspaceRecord,
    command: Extract<ClientCommand, { type: "prompt" }>,
  ) {
    const flags = this.flags();
    const recipe = command.recipeId
      ? this.store.read().recipes.find((r) => r.id === command.recipeId)
      : undefined;
    const filled = recipe
      ? recipe.template.replaceAll("{{model}}", command.text)
      : command.text;
    const inspect = command.inspect ?? [];
    const agentBody = withInspectPrompt(filled, inspect.map((pin) => pin.note));
    const agentText = currentRequestText(`${promptPrefixForMode(command.mode)}${agentBody}`);
    const runId = randomUUID();

    if (session.events.length === 0) {
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id)!;
        s.title = titleFromPrompt(filled || inspect[0]?.label || "");
      });
    }

    this.append(session.id, {
      type: "user_message",
      id: randomUUID(),
      at: new Date().toISOString(),
      text: filled,
      attachments: command.attachments,
      mentions: command.mentions,
      inspect,
      skill: command.skill ?? slashInvocation(filled) ?? undefined,
    });

    const existing = this.store.read().runLock[ws.id];
    if (existing && !canAcquireLease(existing as { sessionId: string; userId: string; leaseUntil: string }, session.id)) {
      this.append(session.id, {
        type: "run_failure",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        kind: "provider_failed",
        message: "Workspace is busy",
      });
      return;
    }
    if (isFlagOn(flags, "transactionalReview") && hasPendingProposal(this.snapshot(session.id).hunks)) {
      this.append(session.id, {
        type: "run_failure",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        kind: "provider_failed",
        message: "Workspace has a pending change proposal",
      });
      return;
    }
    const lease = createLease(session.id, user.id);
    this.store.update((d) => {
      d.runLock[ws.id] = lease;
    });
    this.append(session.id, {
      type: "run",
      id: randomUUID(),
      at: new Date().toISOString(),
      v: 1,
      runId,
      status: "running",
    });

    const mentionIndex = await mentionIndexFromWorktree(ws.worktree);
    const mentionBlocks = command.mentions.map((mention, i) => {
      const kind = classifyMention(mention, mentionIndex);
      const relative = mentionFileHint(mention, kind);
      let contents = "";
      if (relative) {
        try {
          contents = readFileSync(join(ws.worktree, relative), "utf8");
        } catch {
          contents = "";
        }
      }
      const text = mentionPromptText(mention, mentionIndex, contents);
      return {
        id: mention,
        kind: "mentions" as const,
        text,
        tokens: estimateTokens(text),
        priority: 2 + i,
      };
    });

    const rules = compileRules(this.getRulesFor(user), user.locale);
    const packed = packPrompt(
      [
        { id: "user", kind: "user", text: agentText, tokens: estimateTokens(agentText), priority: 0 },
        { id: "rules", kind: "rules", text: rules.markdown, tokens: estimateTokens(rules.markdown), priority: 1 },
        ...mentionBlocks,
      ],
      4000,
    );
    this.append(session.id, {
      type: "prompt_manifest",
      id: randomUUID(),
      at: new Date().toISOString(),
      v: 1,
      usedTokens: packed.usedTokens,
      omitted: packed.omitted,
      blocks: [
        { id: "user", kind: "user", tokens: estimateTokens(agentText) },
        { id: "rules", kind: "rules", tokens: estimateTokens(rules.markdown) },
        ...mentionBlocks.map((block) => ({ id: block.id, kind: "mentions", tokens: block.tokens })),
      ].filter((block) => !packed.omitted.includes(`${block.kind}:${block.id}`)),
    });
    if (packed.omitted.length) {
      this.append(session.id, {
        type: "dropped_context",
        id: randomUUID(),
        at: new Date().toISOString(),
        omitted: packed.omitted,
      });
    }

    const usage = { startedAt: Date.now(), toolCalls: 0, costUsd: 0 };
    const seenToolCallIds = new Set<string>();
    const usageProfile = this.usageProfileFor(user);
    const usageLimitsOn = isFlagOn(flags, "usageLimits");
    const meter = createRunMeter(packed.usedTokens);
    const usageNow = this.usageSummary(user.id);
    // The ACP process and its `onEvent` closure outlive a single prompt, so the
    // meter for the current run has to be looked up per event, not captured.
    this.runMeters.set(session.id, {
      meter,
      profile: usageProfile,
      enforce: usageLimitsOn,
      periodTokens: usageNow.periodTokens,
      limitTokens: usageNow.limitTokens,
    });
    const budget = defaultBudget();
    const span = startSpan("agent.prompt", { sessionId: session.id, workspaceId: ws.id, mode: command.mode ?? "agent" });
    const budgetTimer = setTimeout(() => {
      this.append(session.id, {
        type: "budget",
        id: randomUUID(),
        at: new Date().toISOString(),
        reason: "duration",
        message: "Run stopped: duration budget exceeded",
      });
      void this.runs.get(session.id)?.cancel();
    }, budget.maxDurationMs);
    const providerId = resolveSessionProvider(session.provider);
    if (providerId !== session.provider) this.setSessionProvider(session.id, providerId);
    const capability = PROVIDER_CATALOG.find((row) => row.id === providerId);
    const requestedMode = command.mode ?? "agent";
    const mode = capability?.modes.includes(requestedMode) ? requestedMode : "agent";
    const fingerprint = this.workspaceToolsFingerprint(ws);
    let run = this.runs.get(session.id);
    if (run && (this.runModes.get(session.id) !== mode || this.runFingerprints.get(session.id) !== fingerprint)) {
      this.dropProviderRun(session.id);
      run = undefined;
    }
    const model = this.providerConfig()[providerId]?.model?.trim() || undefined;
    const candidates = this.authCandidates(providerId);
    const tried = new Set<string>();
    let allowResume = true;
    const mcpServers = acpServersForWorktree({
      worktree: ws.worktree,
      storeDir: this.storeDir(),
      userId: ws.userId,
      prefs: this.store.read().mcpPrefs,
    });
    const onEvent = (event: SessionEvent) => {
      if (
        event.type === "assistant_delta" ||
        event.type === "assistant_message" ||
        event.type === "tool_call"
      ) {
        this.promptTouched.add(session.id);
      }
      // The ACP process is reused across prompts, so this closure must
      // write the session buffer — not a `let streamed` from the first start.
      if (event.type === "assistant_delta") this.promptText.append(session.id, event.text);
      const metered = this.runMeters.get(session.id);
      if (metered) meterSessionEvent(metered.meter, event);
      if (event.type === "tool_call" && !seenToolCallIds.has(event.toolCallId)) {
        seenToolCallIds.add(event.toolCallId);
        usage.toolCalls += 1;
      }
      if (event.type === "tool_call") {
        this.store.update((d) => {
          const current = d.runLock[ws.id];
          if (current) d.runLock[ws.id] = heartbeatLease(createLease(current.sessionId, current.userId));
        });
      }
      const monthlyCap = metered?.limitTokens ?? 0;
      if (
        metered?.enforce
        && metered.profile.enforcement === "block"
        && monthlyCap > 0
        && metered.periodTokens + meterBillableTokens(metered.meter, metered.profile) > monthlyCap
      ) {
        this.append(session.id, {
          type: "budget",
          id: randomUUID(),
          at: new Date().toISOString(),
          reason: "period",
          message: "Run stopped: monthly token limit reached",
        });
        void this.runs.get(session.id)?.cancel();
        return;
      }
      const reason = budgetExceeded(budget, usage);
      if (reason) {
        this.append(session.id, {
          type: "budget",
          id: randomUUID(),
          at: new Date().toISOString(),
          reason,
          message: `Run stopped: ${reason} budget exceeded`,
        });
        void this.runs.get(session.id)?.cancel();
        return;
      }
      if (shouldFlushAssistantText(event)) this.flushPromptText(session.id);
      this.append(session.id, event);
    };
    const onPermission = (event: SessionEvent, rpcId: number) => {
      this.flushPromptText(session.id);
      const title = event.type === "permission" ? event.title : "";
      const decision = evaluatePermission(permissionRequestFromTitle(title, ws.worktree));
      if (decision === "auto-deny" || decision === "auto-allow") {
        const outcome = decision === "auto-deny" ? "reject-once" : "allow-once";
        this.runs.get(session.id)?.respondPermission?.(rpcId, outcome);
        this.append(session.id, event.type === "permission" ? { ...event, outcome } : event);
        if (decision === "auto-deny") {
          this.append(session.id, {
            type: "run_failure",
            id: randomUUID(),
            at: new Date().toISOString(),
            v: 1,
            kind: "permission_denied",
            message: title,
          });
        }
        return;
      }
      this.append(session.id, event);
      this.pendingPermissions.set(session.id, {
        rpcId,
        respond: this.runs.get(session.id)?.respondPermission,
      });
    };
    const startRun = async (candidate?: CursorAuthCandidate | { kind: "key"; ref: string; value: string }): Promise<ProviderRun> => {
      const provider = this.providerFactory(providerId);
      const next = await provider.start({
        cwd: ws.worktree,
        resumeSessionId: allowResume ? session.acpSessionId : undefined,
        mode,
        sandbox: isFlagOn(flags, "sandboxedAgent"),
        sandboxProfile: resolveSandboxProfile(flags),
        mcpServers,
        apiKey: candidate?.kind === "key" ? candidate.value : undefined,
        home: candidate?.kind === "cli" ? candidate.home : undefined,
        model,
        onEvent,
        onPermission,
      });
      this.runs.set(session.id, next);
      this.runModes.set(session.id, mode);
      this.runFingerprints.set(session.id, fingerprint);
      if (candidate?.ref) this.runKeyRefs.set(session.id, candidate.ref);
      if (next.models?.length) this.rememberProviderModels(providerId, next.models);
      if (next.acpSessionId) {
        this.store.update((d) => {
          const row = d.sessions.find((s) => s.id === session.id);
          if (row) row.acpSessionId = next.acpSessionId;
        });
      }
      return next;
    };
    const startWithFailover = async (): Promise<ProviderRun> => {
      if (!candidates.length) return startRun();
      let lastError: unknown;
      for (const candidate of candidates) {
        if (tried.has(candidate.ref)) continue;
        tried.add(candidate.ref);
        try {
          return await startRun(candidate);
        } catch (error) {
          lastError = error;
          const message = formatAgentError(error);
          if (!this.applyAuthSlotFailure(providerId, candidate, message, session.id)) throw error;
          allowResume = false;
          this.append(session.id, {
            type: "run_failure",
            id: randomUUID(),
            at: new Date().toISOString(),
            v: 1,
            kind: "provider_failover",
            message: "The Cursor account ran out of credit; trying the next one.",
          });
        }
      }
      throw lastError ?? new Error("No Cursor CLI account or API key is available");
    };
    try {
      this.promptText.reset(session.id);
      this.promptTouched.delete(session.id);
      if (!run) run = await startWithFailover();
      const attachmentBlocks = this.attachmentBlocks(command.attachments, ws.worktree);
      meter.inputTokens += estimatePromptBlockTokens(attachmentBlocks);
      const blocks: AcpPromptBlock[] = [{ type: "text", text: packed.text }, ...attachmentBlocks];
      const statesBefore = await worktreeFileStates(ws.worktree);
      const fingerprintBefore = await worktreeFingerprint(ws.worktree);
      this.promptText.reset(session.id);
      try {
        await run.prompt(blocks);
      } catch (error) {
        const message = formatAgentError(error);
        const failedRef = this.runKeyRefs.get(session.id);
        const failed = candidates.find((row) => row.ref === failedRef);
        if (failedRef && failed && this.applyAuthSlotFailure(providerId, failed, message, session.id)) {
          allowResume = false;
          this.append(session.id, {
            type: "run_failure",
            id: randomUUID(),
            at: new Date().toISOString(),
            v: 1,
            kind: "provider_failover",
            message: "The Cursor account ran out of credit; trying the next one.",
          });
          run = await startWithFailover();
          this.promptTouched.delete(session.id);
          this.promptText.reset(session.id);
          await run.prompt(blocks);
        } else {
          throw error;
        }
      }
      const usedRef = this.runKeyRefs.get(session.id);
      if (usedRef) this.recordAuthSlotSuccess(providerId, usedRef);
      this.flushPromptText(session.id);
      try {
        const changed = changedWorktreePaths(statesBefore, await worktreeFileStates(ws.worktree));
        if ((await worktreeFingerprint(ws.worktree)) === fingerprintBefore || !changed.length) {
          this.append(session.id, {
            type: "run",
            id: randomUUID(),
            at: new Date().toISOString(),
            v: 1,
            runId,
            status: "accepted",
            reason: "no worktree changes",
          });
          return;
        }
        for (const event of await worktreeDiffEvents(ws.worktree, changed)) this.append(session.id, event);
        if (isFlagOn(flags, "transactionalReview")) {
          const proposal = await createProposalCommit(ws.worktree, { name: user.name, email: user.email }, titleFromPrompt(filled), changed);
          if (proposal) {
            this.append(session.id, {
              type: "proposal",
              id: randomUUID(),
              at: new Date().toISOString(),
              v: 1,
              runId,
              baseSha: proposal.baseSha,
              proposalSha: proposal.proposalSha,
              files: proposal.files,
            });
            this.append(session.id, {
              type: "run",
              id: randomUUID(),
              at: new Date().toISOString(),
              v: 1,
              runId,
              status: "reviewing",
            });
          }
        } else {
          const sha = await commitWorktree(ws.worktree, { name: user.name, email: user.email }, titleFromPrompt(filled));
          if (sha) {
            this.append(session.id, {
              type: "checkpoint",
              id: randomUUID(),
              at: new Date().toISOString(),
              gitSha: sha,
              label: titleFromPrompt(filled),
            });
          }
        }
        const bytes = await worktreeBytes(ws.worktree);
        this.store.update((d) => {
          const row = d.workspaces.find((w) => w.id === ws.id);
          if (row) row.bytes = bytes;
        });
      } catch (error) {
        this.append(session.id, {
          type: "run_failure",
          id: randomUUID(),
          at: new Date().toISOString(),
          v: 1,
          kind: "diff_capture_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      this.flushPromptText(session.id);
      const message = formatAgentError(error);
      const failedRef = this.runKeyRefs.get(session.id);
      const failed = candidates.find((row) => row.ref === failedRef);
      if (failedRef && failed) this.applyAuthSlotFailure(providerId, failed, message, session.id);
      this.dropProviderRun(session.id);
      this.append(session.id, {
        type: "assistant_message",
        id: randomUUID(),
        at: new Date().toISOString(),
        text: `The agent could not complete this prompt. ${message}`,
        streaming: false,
      });
      this.append(session.id, {
        type: "run_failure",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        kind: "provider_failed",
        message,
      });
    } finally {
      span.end({ toolCalls: usage.toolCalls });
      const baseline = this.store.read().sessions.find((s) => s.id === session.id)?.costBaselineUsd ?? 0;
      const runCostUsd = costDelta(baseline, meter.cumulativeCostUsd);
      if (meter.cumulativeCostUsd > baseline) {
        this.store.update((d) => {
          const row = d.sessions.find((s) => s.id === session.id);
          if (row) row.costBaselineUsd = meter.cumulativeCostUsd;
        });
      }
      this.recordRunUsage(
        ledgerEntryFromMeter({
          id: randomUUID(),
          meter,
          userId: user.id,
          workspaceId: ws.id,
          sessionId: session.id,
          runId,
          provider: providerId,
          costUsd: runCostUsd,
          tz: usageTimezone(),
        }),
      );
      recordUsage({ sessionId: session.id, tokens: meterEstimatedTokens(meter), costUsd: runCostUsd, toolCalls: usage.toolCalls });
      this.runMeters.delete(session.id);
      clearTimeout(budgetTimer);
      this.store.update((d) => {
        delete d.runLock[ws.id];
      });
    }
  }

  createInvite(
    user: UserRecord,
    input: { workspaceId: string; role?: string } = { workspaceId: "" },
  ): { token: string; url: string; id: string; role: WorkspaceMemberRole; expiresAt: string } {
    const workspaceId = input.workspaceId;
    const ws = this.requireWorkspace(workspaceId);
    if (ws.status === "destroyed") throw new Error("Workspace not found");
    if (!this.canManageWorkspace(user, ws)) throw new Error("Forbidden");
    const role = normalizeWorkspaceMemberRole(input.role);
    const token = randomBytes(16).toString("hex");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    this.store.update((d) => {
      d.invites.push({
        id,
        token,
        projectId: ws.projectId,
        workspaceId: ws.id,
        role,
        createdBy: user.id,
        expiresAt,
      });
    });
    return { token, url: `/invite/${token}`, id, role, expiresAt };
  }

  invitePreview(token: string) {
    const invite = this.store.read().invites.find((row) => row.token === token);
    if (!invite) throw new Error("Invite not found");
    const expired = new Date(invite.expiresAt).getTime() < Date.now();
    const used = Boolean(invite.acceptedBy);
    if (!invite.workspaceId) {
      return {
        valid: false,
        expired: true,
        accepted: used,
        workspaceId: null,
        ownerLogin: "",
        ownerName: "",
        role: invite.role ?? "editor",
        expiresAt: invite.expiresAt,
      };
    }
    const ws = this.store.read().workspaces.find((row) => row.id === invite.workspaceId && row.status !== "destroyed");
    const owner = ws ? this.store.read().users.find((row) => row.id === ws.userId) : undefined;
    const valid = Boolean(ws && !expired && !used);
    return {
      valid,
      expired: expired || !ws,
      accepted: used,
      workspaceId: ws?.id ?? invite.workspaceId,
      ownerLogin: owner?.login ?? "",
      ownerName: owner?.name ?? "",
      role: invite.role ?? "editor",
      expiresAt: invite.expiresAt,
    };
  }

  listWorkspaceInvites(workspaceId: string) {
    const now = Date.now();
    const db = this.store.read();
    return db.invites
      .filter(
        (row) =>
          row.workspaceId === workspaceId &&
          !row.acceptedBy &&
          new Date(row.expiresAt).getTime() >= now,
      )
      .map((row) => {
        const creator = db.users.find((user) => user.id === row.createdBy);
        return {
          id: row.id,
          role: row.role ?? "editor",
          expiresAt: row.expiresAt,
          url: `/invite/${row.token}`,
          createdByLogin: creator?.login ?? "",
        };
      });
  }

  revokeInvite(actor: UserRecord, inviteId: string) {
    const invite = this.store.read().invites.find((row) => row.id === inviteId);
    if (!invite) throw new Error("Invite not found");
    if (!invite.workspaceId) throw new Error("Invite expired");
    const ws = this.requireWorkspace(invite.workspaceId);
    if (!this.canManageWorkspace(actor, ws)) throw new Error("Forbidden");
    if (invite.acceptedBy) throw new Error("Invite already used");
    this.store.update((d) => {
      d.invites = d.invites.filter((row) => row.id !== inviteId);
    });
    return { ok: true };
  }

  acceptInvite(
    token: string,
    user: UserRecord,
  ): { pending: boolean; workspaceId?: string; role?: WorkspaceMemberRole; ownerLogin?: string } {
    const invite = this.store.read().invites.find((i) => i.token === token);
    if (!invite) throw new Error("Invite not found");
    if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error("Invite expired");
    if (invite.acceptedBy && invite.acceptedBy !== user.id) throw new Error("Invite already used");
    if (!invite.workspaceId) throw new Error("Invite expired");
    const ws = this.store.read().workspaces.find((row) => row.id === invite.workspaceId && row.status !== "destroyed");
    if (!ws) throw new Error("Workspace not found");
    if (ws.userId === user.id) throw new Error("Cannot accept own workspace invite");
    if (user.accessPending) return { pending: true, workspaceId: ws.id };
    const role: WorkspaceMemberRole = isWorkspaceMemberRole(invite.role) ? invite.role : "editor";
    const owner = this.store.read().users.find((row) => row.id === ws.userId);
    this.store.update((d) => {
      const row = d.invites.find((i) => i.token === token)!;
      row.acceptedBy = user.id;
      const existing = d.workspaceMembers.find((m) => m.workspaceId === ws.id && m.userId === user.id);
      if (existing) {
        existing.role = role;
        existing.invitedBy = invite.createdBy;
        existing.acceptedAt = existing.acceptedAt || new Date().toISOString();
      } else {
        d.workspaceMembers.push({
          workspaceId: ws.id,
          userId: user.id,
          role,
          invitedBy: invite.createdBy,
          acceptedAt: new Date().toISOString(),
        });
      }
    });
    return { pending: false, workspaceId: ws.id, role, ownerLogin: owner?.login ?? "" };
  }

  listWorkspaceMembers(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    const db = this.store.read();
    const owner = db.users.find((row) => row.id === ws.userId);
    const ownerRow = {
      userId: ws.userId,
      login: owner?.login ?? "",
      name: owner?.name ?? "",
      role: "owner" as const,
      invitedBy: null as string | null,
      acceptedAt: null as string | null,
      isOwner: true,
    };
    const members = db.workspaceMembers
      .filter((row) => row.workspaceId === workspaceId)
      .map((row) => {
        const user = db.users.find((item) => item.id === row.userId);
        return {
          userId: row.userId,
          login: user?.login ?? "",
          name: user?.name ?? "",
          role: row.role,
          invitedBy: row.invitedBy,
          acceptedAt: row.acceptedAt,
          isOwner: false,
        };
      })
      .filter((row) => row.userId !== ws.userId);
    return [ownerRow, ...members];
  }

  listAccessibleWorkspaces(user: UserRecord) {
    const db = this.store.read();
    const summarize = (ws: WorkspaceRecord, role: WorkspaceAccessRole) => {
      const owner = db.users.find((row) => row.id === ws.userId);
      return {
        id: ws.id,
        ownerLogin: owner?.login ?? "",
        ownerName: owner?.name ?? "",
        role,
        status: ws.status,
        lastActiveAt: ws.lastActiveAt,
        sessionCount: db.sessions.filter((session) => session.workspaceId === ws.id).length,
        isOwn: ws.userId === user.id,
      };
    };
    const own = db.workspaces.find((row) => row.userId === user.id && row.status !== "destroyed");
    const memberships = db.workspaceMembers
      .filter((row) => row.userId === user.id)
      .map((row) => {
        const ws = db.workspaces.find((item) => item.id === row.workspaceId && item.status !== "destroyed");
        if (!ws || ws.userId === user.id) return null;
        return summarize(ws, row.role);
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    return { own: own ? summarize(own, "owner") : null, memberships };
  }

  removeWorkspaceMember(actor: UserRecord, workspaceId: string, userId: string) {
    const ws = this.requireWorkspace(workspaceId);
    if (ws.userId === userId) throw new Error("Forbidden");
    const manage = this.canManageWorkspace(actor, ws);
    if (!manage && actor.id !== userId) throw new Error("Forbidden");
    const existing = this.store.read().workspaceMembers.find((row) => row.workspaceId === workspaceId && row.userId === userId);
    if (!existing) throw new Error("User not found");
    this.store.update((d) => {
      d.workspaceMembers = d.workspaceMembers.filter((row) => !(row.workspaceId === workspaceId && row.userId === userId));
      d.presence = d.presence.filter((row) => !(row.workspaceId === workspaceId && row.userId === userId));
    });
    return { ok: true };
  }

  setWorkspaceMemberRole(actor: UserRecord, workspaceId: string, userId: string, role: string) {
    const ws = this.requireWorkspace(workspaceId);
    if (!this.canManageWorkspace(actor, ws)) throw new Error("Forbidden");
    if (ws.userId === userId) throw new Error("Forbidden");
    const nextRole = normalizeWorkspaceMemberRole(role);
    const existing = this.store.read().workspaceMembers.find((row) => row.workspaceId === workspaceId && row.userId === userId);
    if (!existing) throw new Error("User not found");
    this.store.update((d) => {
      const row = d.workspaceMembers.find((item) => item.workspaceId === workspaceId && item.userId === userId);
      if (row) row.role = nextRole;
    });
    return this.listWorkspaceMembers(workspaceId).find((row) => row.userId === userId);
  }

  addWorkspaceMember(actor: UserRecord, workspaceId: string, input: { login: string; role?: string }) {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const ws = this.requireWorkspace(workspaceId);
    if (ws.status === "destroyed") throw new Error("Workspace not found");
    const role = normalizeWorkspaceMemberRole(input.role);
    const target = this.store.read().users.find((row) => sameLogin(row.login, input.login.trim()));
    if (!target) throw new Error("User not found");
    if (target.accessPending) throw new Error("Forbidden");
    if (target.id === ws.userId) throw new Error("Cannot accept own workspace invite");
    this.store.update((d) => {
      const existing = d.workspaceMembers.find((row) => row.workspaceId === workspaceId && row.userId === target.id);
      if (existing) existing.role = role;
      else {
        d.workspaceMembers.push({
          workspaceId,
          userId: target.id,
          role,
          invitedBy: actor.id,
          acceptedAt: new Date().toISOString(),
        } satisfies WorkspaceMemberRecord);
      }
    });
    return this.listWorkspaceMembers(workspaceId).find((row) => row.userId === target.id);
  }

  sharePreview(workspaceId: string): { token: string } {
    const token = randomBytes(12).toString("hex");
    this.store.update((d) => {
      d.shares.push({
        token,
        workspaceId,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
    });
    return { token };
  }

  resolveShare(token: string): WorkspaceRecord | null {
    const share = this.store.read().shares.find((s) => s.token === token);
    if (!share || new Date(share.expiresAt).getTime() < Date.now()) return null;
    return this.requireWorkspace(share.workspaceId);
  }

  setPresence(workspaceId: string, userId: string, mode: "editor" | "spectator") {
    this.store.update((d) => {
      d.presence = d.presence.filter((p) => !(p.workspaceId === workspaceId && p.userId === userId));
      d.presence.push({ workspaceId, userId, mode, at: new Date().toISOString() });
    });
  }

  reportPreviewError(workspaceId: string, sessionId: string | undefined, payload: { source: "laravel" | "vite" | "console" | "network" | "preview"; message: string; stack?: string }) {
    const session = sessionId
      ? this.store.read().sessions.find((s) => s.id === sessionId)
      : this.store.read().sessions.find((s) => s.workspaceId === workspaceId);
    if (!session) return;
    this.append(session.id, {
      type: "runtime_error",
      id: randomUUID(),
      at: new Date().toISOString(),
      source: payload.source,
      message: payload.message,
      stack: payload.stack,
    });
  }

  getRules(): RuleRecord[] {
    return storedRules(this.store.read().rules);
  }

  getRulesFor(actor: UserRecord): RuleRecord[] {
    return rulesForActor(this.getRules(), actor.id);
  }

  listAdminRules(): RuleRecord[] {
    return adminRules(this.getRules());
  }

  studioRules(actor: UserRecord, worktree?: string): Array<RuleRecord & { editable: boolean; origin?: "repo" }> {
    const rows = this.getRulesFor(actor).map((row) => ({
      ...row,
      editable: row.level === "user" && row.userId === actor.id,
    }));
    const repo = this.readRepoAgents(worktree);
    return repo ? [...rows, repo] : rows;
  }

  saveUserRule(
    actor: UserRecord,
    input: { id?: string; title: string; body: string; description?: string; slug?: string; alwaysApply?: boolean },
  ): RuleRecord[] {
    const title = (input.title ?? "").trim();
    const body = (input.body ?? "").trim();
    if (!title || !body) throw new Error("Rule title and body are required");
    const current = this.getRules();
    if (input.id) {
      const existing = current.find((row) => row.id === input.id && row.level === "user" && row.userId === actor.id);
      if (!existing) throw new Error("Rule not found");
    }
    const id = input.id?.trim() || randomUUID();
    const record = normalizeRule({
      id,
      level: "user",
      title,
      body,
      description: input.description,
      slug: input.slug,
      alwaysApply: input.alwaysApply,
      userId: actor.id,
    });
    if (!isRuleSlug(record.slug)) throw new Error("Invalid rule slug");
    if (
      current.some(
        (row) => row.level === "user" && row.userId === actor.id && row.slug === record.slug && row.id !== record.id,
      )
    ) {
      throw new Error("Rule slug already exists");
    }
    this.replaceRule(record);
    this.materializeOwnerRules(actor.id, actor.locale);
    return this.getRulesFor(actor);
  }

  deleteUserRule(actor: UserRecord, id: string): RuleRecord[] {
    const current = this.getRules();
    const existing = current.find((row) => row.id === id && row.level === "user" && row.userId === actor.id);
    if (!existing) throw new Error("Rule not found");
    this.store.update((d) => {
      d.rules = current.filter((row) => row.id !== id);
    });
    this.materializeOwnerRules(actor.id, actor.locale);
    return this.getRulesFor(actor);
  }

  saveAdminRule(
    actor: UserRecord,
    input: {
      id?: string;
      level: "platform" | "project";
      title: string;
      body: string;
      description?: string;
      slug?: string;
      alwaysApply?: boolean;
    },
  ): RuleRecord[] {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const title = (input.title ?? "").trim();
    const body = (input.body ?? "").trim();
    if (!title || !body) throw new Error("Rule title and body are required");
    if (input.level !== "platform" && input.level !== "project") throw new Error("Invalid rule level");
    const current = this.getRules();
    if (input.id) {
      const existing = current.find((row) => row.id === input.id && row.level !== "user");
      if (!existing) throw new Error("Rule not found");
    }
    const id = input.id?.trim() || randomUUID();
    const record = normalizeRule({
      id,
      level: input.level,
      title,
      body,
      description: input.description,
      slug: input.slug,
      alwaysApply: input.alwaysApply,
    });
    if (!isRuleSlug(record.slug)) throw new Error("Invalid rule slug");
    if (current.some((row) => row.level !== "user" && row.slug === record.slug && row.id !== record.id)) {
      throw new Error("Rule slug already exists");
    }
    this.replaceRule(record);
    this.materializeRulesEverywhere(actor.locale);
    return this.listAdminRules();
  }

  deleteAdminRule(actor: UserRecord, id: string): RuleRecord[] {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const current = this.getRules();
    const existing = current.find((row) => row.id === id && row.level !== "user");
    if (!existing) throw new Error("Rule not found");
    this.store.update((d) => {
      d.rules = current.filter((row) => row.id !== id);
    });
    this.materializeRulesEverywhere(actor.locale);
    return this.listAdminRules();
  }

  adminOverview() {
    const db = this.store.read();
    const workspaces = db.workspaces.filter((row) => row.status !== "destroyed");
    const errored = workspaces.filter((row) => row.status === "error" || Boolean(row.lastError));
    const last = [...errored].sort((a, b) => {
      const left = new Date(a.errorAt ?? a.lastActiveAt).getTime();
      const right = new Date(b.errorAt ?? b.lastActiveAt).getTime();
      return right - left;
    })[0];
    return {
      githubConfigured: Boolean(loadGitHubAppCredentials() || hasGitHubOAuth()),
      cursorKey: hasCursorApiKey(process.env, this.envRoot()) || this.cursorCliAccounts().some((row) => row.loggedIn),
      publicUrl: atelierPublicUrl(),
      users: db.users.length,
      running: workspaces.filter((row) => row.status === "running").length,
      hibernated: workspaces.filter((row) => row.status === "hibernated").length,
      error: workspaces.filter((row) => row.status === "error").length,
      lastPreviewError: last?.lastError ?? null,
      lastPreviewErrorLogin: last ? db.users.find((user) => user.id === last.userId)?.login ?? null : null,
      lastPreviewErrorAt: last?.errorAt ?? null,
      lastPreviewErrorWorkspaceId: last?.id ?? null,
      flags: this.flags(),
    };
  }

  usageProfiles(): UsageProfile[] {
    const stored = this.store.read().usageProfiles;
    const rows = stored.length ? stored : defaultUsageProfiles();
    return rows.map(normalizeUsageProfile);
  }

  usageProfileFor(user: { id: string; usageProfileId?: string }): UsageProfile {
    return resolveUsageProfile(user, this.usageProfiles(), defaultUsageProfileId());
  }

  saveUsageProfiles(actor: UserRecord, profiles: unknown): UsageProfile[] {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const parsed = UsageProfileSchema.array().min(1).parse(profiles);
    const ids = new Set(parsed.map((row) => row.id));
    if (ids.size !== parsed.length) throw new Error("Duplicate profile id");
    const previous = this.usageProfiles();
    const removed = previous.filter((row) => !ids.has(row.id));
    if (removed.length) {
      const occupied = this.store.read().users.some((user) =>
        removed.some((row) => this.usageProfileFor(user).id === row.id),
      );
      if (occupied) throw new Error("Cannot remove a profile that still has people");
    }
    this.store.update((d) => {
      d.usageProfiles = parsed.map((row) => ({ ...d.usageProfiles.find((current) => current.id === row.id), ...row }));
    });
    return this.usageProfiles();
  }

  deleteUsageProfile(actor: UserRecord, profileId: string, migrateTo?: string): UsageProfile[] {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const profiles = this.usageProfiles();
    if (!profiles.some((row) => row.id === profileId)) throw new Error("Profile not found");
    if (profiles.length <= 1) throw new Error("Cannot delete the last usage profile");
    const remaining = profiles.filter((row) => row.id !== profileId);
    const assignedIds = this.store.read().users
      .filter((user) => this.usageProfileFor(user).id === profileId)
      .map((user) => user.id);
    if (assignedIds.length) {
      if (!migrateTo) throw new Error("migrateTo required");
      if (!remaining.some((row) => row.id === migrateTo)) throw new Error("Profile not found");
    }
    this.store.update((d) => {
      if (assignedIds.length && migrateTo) {
        const moving = new Set(assignedIds);
        for (const user of d.users) {
          if (moving.has(user.id)) user.usageProfileId = migrateTo;
        }
      }
      d.usageProfiles = remaining;
    });
    return this.usageProfiles();
  }

  setUserUsageProfile(actor: UserRecord, userId: string, profileId: string): UsageSummary {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    if (!this.usageProfiles().some((row) => row.id === profileId)) throw new Error("Profile not found");
    const target = this.store.read().users.find((row) => row.id === userId);
    if (!target) throw new Error("User not found");
    this.store.update((d) => {
      const row = d.users.find((user) => user.id === userId);
      if (row) row.usageProfileId = profileId;
    });
    return this.usageSummary(userId);
  }

  grantUsageTokens(actor: UserRecord, userId: string, tokens: number, reason: string): UsageSummary {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    if (!Number.isFinite(tokens) || tokens === 0) throw new Error("tokens must be a non-zero number");
    const target = this.store.read().users.find((row) => row.id === userId);
    if (!target) throw new Error("User not found");
    this.store.update((d) => {
      d.usageGrants.push({
        id: randomUUID(),
        userId,
        periodKey: usagePeriodKey(new Date(), usageTimezone()),
        tokens: Math.trunc(tokens),
        reason: reason.trim(),
        byUserId: actor.id,
        at: new Date().toISOString(),
      });
    });
    return this.usageSummary(userId);
  }

  usageSummary(
    userId: string,
    options: { pendingTokens?: number; provider?: string; at?: Date } = {},
  ): UsageSummary {
    const db = this.store.read();
    const user = db.users.find((row) => row.id === userId);
    const profile = this.usageProfileFor(user ?? { id: userId });
    return summarizeUsage({
      userId,
      profile,
      entries: db.usageLedger,
      rollups: db.usageRollups,
      grants: db.usageGrants,
      at: options.at,
      tz: usageTimezone(),
      pendingTokens: options.pendingTokens,
      provider: options.provider,
    });
  }

  listUsageSummaries(): UsageSummary[] {
    return this.store.read().users.map((user) => this.usageSummary(user.id));
  }

  /** Metering is independent of enforcement: the ledger fills even with limits off. */
  private recordRunUsage(entry: UsageLedgerEntry): void {
    if (!isFlagOn(this.flags(), "usageMetering")) return;
    this.store.update((d) => {
      d.usageLedger.push(entry);
    });
  }

  pruneUsageLedger(now = new Date()): { pruned: number } {
    const { expired } = splitExpiredEntries(this.store.read().usageLedger, now, usageRetentionDays());
    if (!expired.length) return { pruned: 0 };
    const expiredIds = new Set(expired.map((row) => row.id));
    this.store.update((d) => {
      const profiles = d.usageProfiles.length ? d.usageProfiles : defaultUsageProfiles();
      const meter = profiles[0]?.meter ?? "max";
      d.usageRollups = mergeRollups(d.usageRollups, rollupFromEntries(expired, meter));
      d.usageLedger = d.usageLedger.filter((row) => !expiredIds.has(row.id));
    });
    return { pruned: expired.length };
  }

  listUsers() {
    const db = this.store.read();
    return db.users.map((user) => {
      const workspace = db.workspaces.find((row) => row.userId === user.id && row.status !== "destroyed");
      const profile = this.usageProfileFor(user);
      return {
        id: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        role: this.roleFor(user),
        usageProfileId: profile.id,
        usageProfileLabel: profile.label,
        accessPending: Boolean(user.accessPending),
        platformAdmin: this.isPlatformAdmin(user),
        envAdmin: adminLoginsFromEnv().some((login) => sameLogin(login, user.login)),
        repoOwner: this.isRepoOwner(user),
        disabled: Boolean(user.disabled),
        canDisable: this.canDisableUser(user),
        workspaceId: workspace?.id ?? null,
        workspaceStatus: workspace?.status ?? null,
        lastActiveAt: workspace?.lastActiveAt ?? null,
        memberships: this.listAccessibleWorkspaces(user).memberships.map((row) => ({
          workspaceId: row.id,
          ownerLogin: row.ownerLogin,
          role: row.role,
        })),
      };
    });
  }

  setPlatformAdmin(actor: UserRecord, userId: string, value: boolean) {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const db = this.store.read();
    const target = db.users.find((row) => row.id === userId);
    if (!target) throw new Error("User not found");
    if (adminLoginsFromEnv().some((login) => sameLogin(login, target.login)) && !value) {
      throw new Error("Cannot revoke an env-listed admin");
    }
    if (!value && this.isRepoOwner(target)) {
      throw new Error("Cannot revoke the permanent platform admin");
    }
    const currentAdmins = db.users.filter((row) => this.isPlatformAdmin(row));
    if (!value) {
      const remaining = currentAdmins.filter((row) => row.id !== userId).length;
      const envOthers = adminLoginsFromEnv().filter((login) => !sameLogin(login, target.login)).length;
      if (remaining + envOthers === 0) {
        throw new Error("Cannot remove the last platform admin");
      }
    }
    this.store.update((d) => {
      const row = d.users.find((user) => user.id === userId);
      if (row) row.platformAdmin = value;
    });
    return this.listUsers().find((row) => row.id === userId);
  }

  async setUserDisabled(
    actor: UserRecord,
    userId: string,
    disabled: boolean,
    options: { destroyWorkspace?: boolean } = {},
  ) {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const target = this.store.read().users.find((row) => row.id === userId);
    if (!target) throw new Error("User not found");
    if (disabled) this.assertCanDisable(target);
    this.store.update((d) => {
      const row = d.users.find((user) => user.id === userId);
      if (row) row.disabled = disabled;
    });
    if (disabled) {
      const live = this.store.read().workspaces.find((row) => row.userId === userId && row.status !== "destroyed");
      if (live) {
        if (options.destroyWorkspace) await this.adminDestroy(live.id);
        else if (live.status === "running") await this.hibernate(live.id);
      }
    }
    return this.listUsers().find((row) => row.id === userId);
  }

  listAdminWorkspaces() {
    const db = this.store.read();
    return db.workspaces
      .filter((row) => row.status !== "destroyed")
      .map((row) => {
        const user = db.users.find((item) => item.id === row.userId);
        const members = this.listWorkspaceMembers(row.id);
        return {
          id: row.id,
          userId: row.userId,
          login: user?.login ?? "",
          branch: row.branch,
          status: row.status,
          lastError: row.lastError ?? null,
          errorAt: row.errorAt ?? null,
          lastActiveAt: row.lastActiveAt,
          port: row.port ?? null,
          vitePort: row.vitePort ?? null,
          bytes: row.bytes ?? null,
          worktree: row.worktree,
          previewPath: row.status === "running" && row.previewToken ? `/-/p/${row.previewToken}` : null,
          canDeactivateUser: user ? this.canDisableUser(user) : false,
          memberCount: Math.max(0, members.length - 1),
          members,
          pendingInvites: this.listWorkspaceInvites(row.id),
        };
      });
  }

  async adminHibernate(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    if (ws.status === "destroyed") throw new Error("Workspace not found");
    if (ws.status === "hibernated") throw new Error("Workspace already hibernated");
    return this.hibernate(workspaceId);
  }

  async adminDestroy(workspaceId: string, options: { deactivateUser?: boolean } = {}) {
    const ws = this.requireWorkspace(workspaceId);
    if (ws.status === "destroyed") throw new Error("Workspace not found");
    const owner = this.store.read().users.find((row) => row.id === ws.userId);
    if (options.deactivateUser) {
      if (!owner) throw new Error("User not found");
      this.assertCanDisable(owner);
    }
    for (const session of this.sessions(workspaceId)) {
      this.runs.get(session.id)?.stop();
      this.runs.delete(session.id);
    }
    await this.runtime.destroy(workspaceId);
    this.store.update((d) => {
      const row = d.workspaces.find((item) => item.id === workspaceId);
      if (!row) return;
      row.status = "destroyed";
      row.desired = "destroyed";
      row.port = undefined;
      row.vitePort = undefined;
      d.workspaceMembers = d.workspaceMembers.filter((item) => item.workspaceId !== workspaceId);
      d.invites = d.invites.filter((item) => item.workspaceId !== workspaceId);
      d.presence = d.presence.filter((item) => item.workspaceId !== workspaceId);
    });
    if (options.deactivateUser && owner) {
      this.store.update((d) => {
        const row = d.users.find((user) => user.id === owner.id);
        if (row) row.disabled = true;
      });
    }
    return this.requireWorkspace(workspaceId);
  }

  listAdminErrors() {
    const db = this.store.read();
    return db.workspaces
      .filter((row) => row.status !== "destroyed" && (row.status === "error" || Boolean(row.lastError)))
      .map((row) => {
        const user = db.users.find((item) => item.id === row.userId);
        const logs = readPreviewLogs(row.id, this.envRoot());
        const message = row.lastError ?? logs.error ?? "";
        return {
          id: row.id,
          userId: row.userId,
          login: user?.login ?? "",
          branch: row.branch,
          status: row.status,
          lastError: message || null,
          errorAt: row.errorAt ?? logs.errorAt ?? null,
          lastActiveAt: row.lastActiveAt,
          previewPath: row.previewToken ? `/-/p/${row.previewToken}` : null,
          hasArtisanLog: Boolean(logs.artisan.trim()),
          hasViteLog: Boolean(logs.vite.trim()),
          hints: suggestPreviewFixes(message, `${logs.artisan}\n${logs.vite}`),
        };
      })
      .sort((a, b) => {
        const left = new Date(a.errorAt ?? a.lastActiveAt).getTime();
        const right = new Date(b.errorAt ?? b.lastActiveAt).getTime();
        return right - left;
      });
  }

  getWorkspaceLogs(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    const logs = readPreviewLogs(workspaceId, this.envRoot());
    const message = ws.lastError ?? logs.error ?? "";
    return {
      workspaceId,
      login: this.store.read().users.find((row) => row.id === ws.userId)?.login ?? "",
      status: ws.status,
      lastError: message || null,
      errorAt: ws.errorAt ?? logs.errorAt ?? null,
      artisan: logs.artisan,
      vite: logs.vite,
      hints: suggestPreviewFixes(message, `${logs.artisan}\n${logs.vite}`),
    };
  }

  async adminResume(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    if (ws.status === "destroyed") throw new Error("Workspace not found");
    return this.wakePreview(workspaceId);
  }

  clearWorkspaceError(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    if (ws.status === "destroyed") throw new Error("Workspace not found");
    this.store.update((d) => {
      const row = d.workspaces.find((item) => item.id === workspaceId);
      if (!row) return;
      row.lastError = undefined;
      row.errorAt = undefined;
      if (row.status === "error") {
        row.status = "hibernated";
        row.desired = "hibernated";
      }
    });
    clearPreviewError(workspaceId, this.envRoot());
    return this.requireWorkspace(workspaceId);
  }

  private seedWorktreePath(): string | undefined {
    for (const ws of this.store.read().workspaces) {
      if (ws.status === "destroyed") continue;
      if (existsSync(join(ws.worktree, ".env.example")) || existsSync(join(ws.worktree, ".env"))) {
        return ws.worktree;
      }
    }
    return undefined;
  }

  /** Stored global.env, or an in-memory draft from a clone. Does not write. */
  resolvedGlobalEnv(): Record<string, string> {
    const stored = readGlobalEnv(this.envRoot());
    if (Object.keys(stored).length) return stored;
    const worktree = this.seedWorktreePath();
    if (!worktree) return {};
    return seedGlobalEnvDraft(readEnvFile(join(worktree, ".env.example")), readEnvFile(join(worktree, ".env")));
  }

  getGlobalEnv() {
    const env = this.resolvedGlobalEnv();
    return {
      env: redactEnv(env),
      raw: serializeEnvFile(redactEnv(env)),
      secrets: pickSecretEnv(env),
    };
  }

  revealGlobalEnvKey(key: string): string {
    return this.resolvedGlobalEnv()[key] ?? "";
  }

  saveGlobalEnv(input: { env?: Record<string, string>; raw?: string }) {
    const current = this.resolvedGlobalEnv();
    const env = restoreRedactedEnv(input.raw != null ? parseEnvFile(input.raw) : (input.env ?? {}), current);
    writeGlobalEnv(env, this.envRoot());
    return this.getGlobalEnv();
  }

  getUserEnv(userId: string) {
    const env = readUserEnv(userId, this.envRoot());
    return { env: redactEnv(env), raw: serializeEnvFile(redactEnv(env)), secrets: pickSecretEnv(env) };
  }

  revealUserEnvKey(userId: string, key: string): string {
    return readUserEnv(userId, this.envRoot())[key] ?? "";
  }

  saveUserEnv(userId: string, input: { env?: Record<string, string>; raw?: string }) {
    const current = readUserEnv(userId, this.envRoot());
    const env = restoreRedactedEnv(input.raw != null ? parseEnvFile(input.raw) : (input.env ?? {}), current);
    writeUserEnv(userId, env, this.envRoot());
    const ws = this.store.read().workspaces.find((row) => row.userId === userId && row.status !== "destroyed");
    if (ws) this.applyEnvToWorktree(ws.id);
    return this.getUserEnv(userId);
  }

  applyEnvToWorktree(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    const publicUrl = this.publicPreviewUrl(ws.previewToken);
    return mergeWorktreeEnv(
      ws.worktree,
      { ...PREVIEW_SIDE_EFFECTS, ...isolationEnv(workspaceId, publicUrl), APP_URL: publicUrl },
      { userId: ws.userId, envRoot: this.envRoot() },
    );
  }

  applyEnvToWorktrees() {
    const ids = this.store.read().workspaces.filter((row) => row.status !== "destroyed").map((row) => row.id);
    return ids.map((id) => ({ id, env: redactEnv(this.applyEnvToWorktree(id)) }));
  }

  providerConfig(): Record<string, ProviderConfig> {
    return this.store.read().providers;
  }

  providerRoster(id: string): ProviderKeyState[] {
    return hydrateProviderKeys(id, this.providerConfig()[id]?.keys ?? [], process.env, this.envRoot());
  }

  cursorCliAccounts(): CursorCliAccount[] {
    this.ensureCursorCliRoster();
    return this.providerConfig().cursor?.cliAccounts ?? [];
  }

  private ensureCursorCliRoster(): void {
    if (process.env.VITEST && !process.env.ATELIER_CURSOR_HOME) return;
    const { migrated } = migrateLegacyCursorHome();
    const current = this.providerConfig().cursor?.cliAccounts ?? [];
    if (current.length || !migrated) return;
    this.store.update((d) => {
      const previous = d.providers.cursor ?? { enabled: true };
      d.providers = {
        ...d.providers,
        cursor: { ...previous, cliAccounts: [emptyCursorCliAccount("default", "Default")] },
      };
    });
  }

  private authCandidates(providerId: string): Array<CursorAuthCandidate | { kind: "key"; ref: string; value: string }> {
    if (providerId === "mock") return [];
    if (providerId === "cursor") {
      return cursorAuthCandidates({
        accounts: this.cursorCliAccounts(),
        keys: this.providerRoster("cursor"),
        credentials: listProviderCredentials("cursor", process.env, this.envRoot()),
      });
    }
    return providerCredentialCandidates(providerId, this.providerRoster(providerId), process.env, this.envRoot()).map(
      (row) => ({ kind: "key" as const, ref: row.ref, value: row.value }),
    );
  }

  getProviderSettings() {
    const config = this.providerConfig();
    const flags = this.flags();
    const implemented = new Set(implementedProviders());
    const cliAccounts = this.cursorCliAccounts();
    const login = this.cliLogin.state;
    return PROVIDER_CATALOG.filter((row) => row.id !== "mock" || process.env.VITEST).map((row) => {
      const roster = this.providerRoster(row.id);
      const stored = new Set(listProviderCredentials(row.id, process.env, this.envRoot()).map((item) => item.ref));
      const health = inspectProviderHealth(
        row.id,
        flags,
        process.env,
        this.envRoot(),
        roster,
        row.id === "cursor" ? cliAccounts : undefined,
      );
      const model = config[row.id]?.model?.trim() || "";
      const discovered = config[row.id]?.models;
      const models = mergeProviderModels(
        discovered?.length ? discovered : providerModelCatalog(row.id),
        providerModelCatalog(row.id),
        model ? [{ id: model, label: model }] : [],
      );
      return {
        id: row.id,
        label: row.label,
        enabled: row.id === "cursor" ? config.cursor?.enabled !== false : Boolean(config[row.id]?.enabled),
        implemented: implemented.has(row.id),
        hasKey: health.hasCredential,
        health: health.status,
        sandbox: health.sandbox,
        message: health.message,
        model,
        models,
        keys: roster.map((key) => ({
          ...key,
          present: stored.has(key.ref),
          usable: isProviderKeyUsable(key),
        })),
        cliAccounts:
          row.id === "cursor"
            ? cliAccounts.map((account) => ({
                ...account,
                usable: isCursorCliAccountUsable(account),
              }))
            : undefined,
        cliLogin: row.id === "cursor" ? login : undefined,
      };
    });
  }

  saveProviderSettings(input: {
    id: string;
    enabled?: boolean;
    apiKey?: string;
    label?: string;
    model?: string;
    keyRef?: string;
    keyEnabled?: boolean;
    keyLabel?: string;
    moveKey?: "up" | "down";
    resetKey?: boolean;
    deleteKey?: boolean;
    addCliAccount?: boolean;
    cliLabel?: string;
    cliAccountId?: string;
    moveCli?: "up" | "down";
    resetCli?: boolean;
    deleteCli?: boolean;
    cliEnabled?: boolean;
  }) {
    const id = input.id;
    const current = this.providerConfig()[id] ?? { enabled: id === "cursor" };
    let keys = hydrateProviderKeys(id, current.keys ?? [], process.env, this.envRoot());
    let cliAccounts = [...(id === "cursor" ? this.cursorCliAccounts() : current.cliAccounts ?? [])];
    const secrets = readProviderSecrets(this.envRoot());

    if (input.apiKey != null && input.apiKey.trim()) {
      const taken = keys.map((key) => key.ref);
      const ref = nextProviderKeyRef(providerSecretKey(id), taken);
      secrets[ref] = input.apiKey.trim();
      keys = [...keys, emptyProviderKeyState(ref, input.label?.trim() ?? "")];
      writeProviderSecrets(secrets, this.envRoot());
    }

    if (input.keyRef) {
      if (!isProviderKeyRef(id, input.keyRef)) throw new Error("Unknown provider key");
      const index = keys.findIndex((key) => key.ref === input.keyRef);
      if (input.deleteKey) {
        delete secrets[input.keyRef];
        writeProviderSecrets(secrets, this.envRoot());
        keys = keys.filter((key) => key.ref !== input.keyRef);
      } else if (input.resetKey && index >= 0) {
        keys[index] = resetProviderKey(keys[index]!);
      } else if (input.moveKey) {
        keys = moveProviderKey(keys, input.keyRef, input.moveKey);
      } else if (index >= 0) {
        const row = { ...keys[index]! };
        if (input.keyEnabled != null) row.enabled = input.keyEnabled;
        if (input.keyLabel != null) row.label = input.keyLabel;
        keys[index] = row;
      }
    }

    if (id === "cursor" && input.addCliAccount) {
      const accountId = nextCursorCliAccountId(cliAccounts.map((row) => row.id));
      ensureCursorAccountHome(accountId);
      cliAccounts = [...cliAccounts, emptyCursorCliAccount(accountId, input.cliLabel?.trim() ?? "")];
    }

    if (id === "cursor" && input.cliAccountId) {
      const index = cliAccounts.findIndex((row) => row.id === input.cliAccountId);
      if (index < 0) throw new Error("Unknown Cursor CLI account");
      if (input.deleteCli) {
        if (this.cliLogin.state?.accountId === input.cliAccountId) this.cliLogin.stop();
        removeCursorAccountHome(input.cliAccountId);
        cliAccounts = cliAccounts.filter((row) => row.id !== input.cliAccountId);
      } else if (input.resetCli) {
        const reset = resetProviderKey({ ...emptyProviderKeyState(input.cliAccountId), ...cliAccounts[index]! });
        cliAccounts[index] = { ...cliAccounts[index]!, failures: reset.failures, cooldownUntil: reset.cooldownUntil, lastError: reset.lastError, lastFailureKind: reset.lastFailureKind };
      } else if (input.moveCli) {
        cliAccounts = moveCursorCliAccount(cliAccounts, input.cliAccountId, input.moveCli);
      } else {
        const row = { ...cliAccounts[index]! };
        if (input.cliEnabled != null) row.enabled = input.cliEnabled;
        if (input.cliLabel != null) row.label = input.cliLabel;
        cliAccounts[index] = row;
      }
    }

    this.store.update((d) => {
      const previous = d.providers[id] ?? { enabled: id === "cursor" };
      d.providers = {
        ...d.providers,
        [id]: {
          ...previous,
          enabled: input.enabled ?? previous.enabled,
          model: input.model !== undefined ? input.model.trim() : previous.model,
          keys,
          models: previous.models,
          cliAccounts: id === "cursor" ? cliAccounts : previous.cliAccounts,
        },
      };
    });
    return this.getProviderSettings();
  }

  providerHealth() {
    const keysByProvider = Object.fromEntries(
      PROVIDER_CATALOG.map((row) => [row.id, this.providerRoster(row.id)]),
    );
    return listProviderHealth(this.flags(), process.env, this.envRoot(), keysByProvider, this.cursorCliAccounts());
  }

  /** Probe Cursor CLI accounts and API keys so /admin sees failures before the first prompt. */
  async probeCursorApiKeys(): Promise<void> {
    if (process.env.VITEST) return;
    this.ensureCursorCliRoster();
    const credentials = listProviderCredentials("cursor", process.env, this.envRoot());
    const accounts = this.cursorCliAccounts();
    if (!credentials.length && !accounts.length) return;
    let command: string;
    try {
      command = await ensureCursorAgent();
    } catch (error) {
      console.error("[atelier] Cursor agent CLI is required to probe API keys", error);
      return;
    }
    if (accounts.length) {
      const probed = await runCursorCliProbes({
        command,
        accounts: accounts.map((row) => ({ id: row.id, home: ensureCursorAccountHome(row.id) })),
      });
      for (const result of probed) {
        this.patchCursorCliAccount(result.id, (account) => ({
          ...account,
          loggedIn: result.loggedIn,
          account: result.account ?? (result.loggedIn ? account.account : null),
        }));
      }
    }
    if (!credentials.length) return;
    const { keys, models } = await runCursorApiKeyProbes({ command, credentials });
    for (const result of keys) {
      if (result.ok) this.recordProviderKeySuccess("cursor", result.ref);
      else if (result.kind !== "cli_login") {
        this.recordProviderKeyFailure("cursor", result.ref, result.message ?? "Cursor API key probe failed");
      }
    }
    if (models.length) {
      this.store.update((d) => {
        const previous = d.providers.cursor ?? { enabled: true };
        d.providers = { ...d.providers, cursor: { ...previous, models } };
      });
    }
    console.info("[atelier] probed Cursor API keys", {
      ok: keys.filter((row) => row.ok).length,
      failed: keys.filter((row) => !row.ok && row.kind !== "cli_login").length,
      models: models.length,
    });
  }

  async syncCursorCliLogin(): Promise<void> {
    const login = this.cliLogin.state;
    if (!login) return;
    await this.refreshCursorCliAccount(login.accountId);
    const account = this.cursorCliAccounts().find((row) => row.id === login.accountId);
    if (account?.loggedIn) this.cliLogin.stop();
  }

  async startCursorCliLogin(accountId: string): Promise<{ started: true; loginUrl?: string; accountId: string }> {
    const account = this.cursorCliAccounts().find((row) => row.id === accountId);
    if (!account) throw new Error("Unknown Cursor CLI account");
    const command = await ensureCursorAgent();
    const home = ensureCursorAccountHome(accountId);
    const env = cursorAgentEnv(process.env, { home, apiKey: false });
    delete env.NO_OPEN_BROWSER;
    const state = this.cliLogin.start({
      accountId,
      command,
      env,
      fallback: () => spawnCursorLoginAcp(command, env),
    });
    return { started: true, loginUrl: state.loginUrl, accountId: state.accountId };
  }

  async signOutCursorCli(accountId: string): Promise<void> {
    const account = this.cursorCliAccounts().find((row) => row.id === accountId);
    if (!account) throw new Error("Unknown Cursor CLI account");
    if (this.cliLogin.state?.accountId === accountId) this.cliLogin.stop();
    try {
      const command = await ensureCursorAgent();
      const home = ensureCursorAccountHome(accountId);
      await defaultCursorProbeRun(command, ["logout"], cursorAgentEnv(process.env, { home, apiKey: false }));
    } catch {
      removeCursorAccountHome(accountId);
      ensureCursorAccountHome(accountId);
    }
    this.patchCursorCliAccount(accountId, (row) => ({ ...row, loggedIn: false, account: null }));
  }

  private async refreshCursorCliAccount(accountId: string): Promise<void> {
    const account = this.cursorCliAccounts().find((row) => row.id === accountId);
    if (!account) return;
    let command: string;
    try {
      command = await ensureCursorAgent();
    } catch {
      return;
    }
    const [result] = await runCursorCliProbes({
      command,
      accounts: [{ id: accountId, home: ensureCursorAccountHome(accountId) }],
    });
    if (!result) return;
    this.patchCursorCliAccount(accountId, (row) => ({
      ...row,
      loggedIn: result.loggedIn,
      account: result.account ?? (result.loggedIn ? row.account : null),
    }));
  }

  private rememberProviderModels(id: string, models: ProviderModel[]) {
    if (!models.length) return;
    this.store.update((d) => {
      const previous = d.providers[id] ?? { enabled: id === "cursor" };
      d.providers = { ...d.providers, [id]: { ...previous, models: mergeProviderModels(models, previous.models) } };
    });
  }

  private shouldRotateAuthSlot(message: string): boolean {
    return isProviderKeyFailure(message) || isCursorCliLoggedOut(message);
  }

  private applyAuthSlotFailure(
    providerId: string,
    candidate: CursorAuthCandidate | { kind: "key"; ref: string; value: string },
    message: string,
    sessionId: string,
  ): boolean {
    if (!this.shouldRotateAuthSlot(message)) return false;
    if (candidate.kind === "cli" && isCursorCliLoggedOut(message)) {
      this.patchCursorCliAccount(candidate.id, (row) => markCursorCliLoggedOut(row));
    } else {
      this.recordAuthSlotFailure(providerId, candidate.ref, message);
    }
    this.dropProviderRun(sessionId);
    return true;
  }

  private recordAuthSlotSuccess(id: string, ref: string) {
    const cliId = parseCursorCliAuthRef(ref);
    if (cliId) {
      this.patchCursorCliAccount(cliId, (row) => {
        const next = markProviderKeySuccess({ ...emptyProviderKeyState(cliId), ...row });
        return {
          ...row,
          failures: next.failures,
          lastUsedAt: next.lastUsedAt,
          cooldownUntil: next.cooldownUntil,
          lastError: next.lastError,
          lastFailureKind: next.lastFailureKind,
        };
      });
      return;
    }
    this.recordProviderKeySuccess(id, ref);
  }

  private recordAuthSlotFailure(id: string, ref: string, message: string) {
    const cliId = parseCursorCliAuthRef(ref);
    if (cliId) {
      this.patchCursorCliAccount(cliId, (row) => {
        const next = markProviderKeyFailure({ ...emptyProviderKeyState(cliId), ...row }, { message });
        return {
          ...row,
          failures: next.failures,
          lastFailureAt: next.lastFailureAt,
          cooldownUntil: next.cooldownUntil,
          lastError: next.lastError,
          lastFailureKind: next.lastFailureKind,
        };
      });
      return;
    }
    this.recordProviderKeyFailure(id, ref, message);
  }

  private recordProviderKeySuccess(id: string, ref: string) {
    this.patchProviderKey(id, ref, (key) => markProviderKeySuccess(key));
  }

  private recordProviderKeyFailure(id: string, ref: string, message: string) {
    this.patchProviderKey(id, ref, (key) => markProviderKeyFailure(key, { message }));
  }

  private patchProviderKey(id: string, ref: string, fn: (key: ProviderKeyState) => ProviderKeyState) {
    this.store.update((d) => {
      const previous = d.providers[id] ?? { enabled: id === "cursor" };
      const keys = hydrateProviderKeys(id, previous.keys ?? [], process.env, this.envRoot());
      const index = keys.findIndex((key) => key.ref === ref);
      if (index >= 0) keys[index] = fn(keys[index]!);
      else keys.push(fn(emptyProviderKeyState(ref)));
      d.providers = { ...d.providers, [id]: { ...previous, keys } };
    });
  }

  private patchCursorCliAccount(id: string, fn: (account: CursorCliAccount) => CursorCliAccount) {
    this.store.update((d) => {
      const previous = d.providers.cursor ?? { enabled: true };
      const accounts = [...(previous.cliAccounts ?? [])];
      const index = accounts.findIndex((row) => row.id === id);
      if (index < 0) return;
      accounts[index] = fn(accounts[index]!);
      d.providers = { ...d.providers, cursor: { ...previous, cliAccounts: accounts } };
    });
  }

  private dropProviderRun(sessionId: string) {
    this.runs.get(sessionId)?.stop();
    this.runs.delete(sessionId);
    this.runModes.delete(sessionId);
    this.runFingerprints.delete(sessionId);
    this.runKeyRefs.delete(sessionId);
  }

  saveFlags(next: Record<string, boolean>) {
    this.store.update((d) => {
      d.flags = { ...d.flags, ...next };
    });
    return this.flags();
  }

  async mentionIndex(workspaceId?: string) {
    if (!workspaceId) return { routes: [] as string[], models: [] as string[], pages: [] as string[] };
    return mentionIndexFromWorktree(this.requireWorkspace(workspaceId).worktree);
  }

  envPreview(workspaceId: string) {
    const spec = defaultWorkspaceSpec();
    const ws = this.requireWorkspace(workspaceId);
    const publicUrl = this.publicPreviewUrl(ws.previewToken);
    const overlay = { ...PREVIEW_SIDE_EFFECTS, ...isolationEnv(workspaceId, publicUrl), APP_URL: publicUrl };
    const example = readEnvFile(join(ws.worktree, ".env.example"));
    const global = readGlobalEnv(this.envRoot());
    const user = readUserEnv(ws.userId, this.envRoot());
    const current = readEnvFile(join(ws.worktree, ".env"));
    const merged = { ...example, ...global, ...user, ...current, ...overlay };
    const origins = Object.fromEntries(
      Object.keys(merged).map((key) => [key, envKeyOrigin(key, { example, global, user, overlay })]),
    );
    return {
      env: redactEnv(merged),
      origins,
      validation: validateEnvContract(spec, merged),
      spec,
    };
  }

  workspaceConnections(workspaceId: string) {
    const stored = this.store.read().connections;
    const fromWorktree = connectionsFromWorktree(this.requireWorkspace(workspaceId).worktree);
    const rows = fromWorktree.length ? fromWorktree : stored;
    return rows.map((row) => ({
      ...row,
      port: row.port || defaultConnectionPort(row.driver),
    }));
  }

  async probeWorkspaceConnections(workspaceId: string) {
    return probeConnections(this.workspaceConnections(workspaceId));
  }

  async workspaceQuota(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    const bytes = await worktreeBytes(ws.worktree);
    this.store.update((d) => {
      const row = d.workspaces.find((w) => w.id === workspaceId);
      if (row) row.bytes = bytes;
    });
    const policy = defaultDiskPolicy();
    return {
      usedMb: Math.round(bytes / (1024 * 1024)),
      limitMb: Math.round(policy.maxBytesPerWorkspace / (1024 * 1024)),
      bytes,
    };
  }

  agentStatus() {
    const listed = this.listProviders();
    const preferred = this.preferredProvider();
    const id = listed.some((row) => row.id === preferred) ? preferred : listed[0]?.id ?? preferred;
    if (process.env.VITEST) return { ready: true, provider: id, error: null };
    const health = inspectProviderHealth(id, this.flags(), process.env, this.envRoot());
    if (id === "cursor" && health.hasCredential && !findCursorAgentBinary()) {
      return { ready: false, provider: id, error: "Cursor agent CLI is not installed" };
    }
    const ready = health.status === "available" || health.status === "degraded";
    return { ready, provider: id, error: ready ? null : health.message ?? "Provider is not ready" };
  }

  skillCatalog(workspaceId: string, actor: UserRecord) {
    const ws = this.assertWorkspaceAccess(actor, workspaceId, "view");
    const { skills, shadowed } = collectSkills({ worktree: ws.worktree, storeDir: this.storeDir(), userId: ws.userId });
    const prefs = this.store.read().skillPrefs;
    const admin = this.isPlatformAdmin(actor);
    const owner = actor.id === ws.userId || admin;
    const toView = (skill: (typeof skills)[number], isShadowed: boolean) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source,
      dir: skill.dir,
      paths: skill.paths,
      manualOnly: skill.manualOnly,
      icon: skill.icon,
      color: skill.color,
      scope: skill.scope,
      enabled: isShadowed ? false : prefs.find((row) => row.userId === ws.userId && row.name === skill.name)?.enabled !== false,
      shadowed: isShadowed,
      issues: skill.issues.map((issue) => issue.message),
      editable: !isShadowed && ((skill.source === "user" && owner) || (skill.source === "platform" && admin)),
      body: !isShadowed && ((skill.source === "user" && owner) || (skill.source === "platform" && admin)) ? skill.body : undefined,
    });
    return {
      skills: [...skills.map((skill) => toView(skill, false)), ...shadowed.map((skill) => toView(skill, true))],
    };
  }

  mcpCatalog(workspaceId: string, actor: UserRecord) {
    const ws = this.assertWorkspaceAccess(actor, workspaceId, "view");
    const { entries, shadowed } = collectMcp({
      worktree: ws.worktree,
      storeDir: this.storeDir(),
      userId: ws.userId,
      prefs: this.store.read().mcpPrefs,
    });
    const admin = this.isPlatformAdmin(actor);
    const owner = actor.id === ws.userId || admin;
    const toView = (entry: (typeof entries)[number], isShadowed: boolean) => {
      const redacted = redactMcpEntry(entry);
      const config = redacted.config;
      const target = config.transport === "stdio" ? [config.command, ...config.args].join(" ").trim() : config.url;
      const secrets =
        config.transport === "stdio"
          ? Object.keys(config.env).some((key) => isSecretMcpKey(key))
          : Object.keys(config.headers).some((key) => isSecretMcpKey(key));
      return {
        name: entry.name,
        transport: config.transport,
        source: entry.source,
        enabled: isShadowed ? false : entry.enabled,
        target,
        secrets: Boolean(secrets),
        editable: !isShadowed && ((entry.source === "user" && owner) || (entry.source === "platform" && admin)),
        shadowed: isShadowed,
        issues: entry.issues,
        command: config.transport === "stdio" ? config.command : undefined,
        args: config.transport === "stdio" ? config.args : undefined,
        env: config.transport === "stdio" ? config.env : undefined,
        url: config.transport !== "stdio" ? config.url : undefined,
        headers: config.transport !== "stdio" ? config.headers : undefined,
      };
    };
    return {
      servers: [...entries.map((entry) => toView(entry, false)), ...shadowed.map((entry) => toView(entry, true))],
      policy: readMcpPolicy(this.storeDir()),
    };
  }

  setSkillEnabled(actor: UserRecord, workspaceId: string, name: string, enabled: boolean) {
    const ws = this.assertWorkspaceAccess(actor, workspaceId, "edit");
    this.setPref("skillPrefs", ws.userId, name, enabled);
    this.materializeWorkspaceTools(ws.worktree, ws.userId);
    this.invalidateWorkspaceRuns(ws.id);
    return this.skillCatalog(workspaceId, actor);
  }

  setMcpEnabled(actor: UserRecord, workspaceId: string, name: string, enabled: boolean) {
    const ws = this.assertWorkspaceAccess(actor, workspaceId, "edit");
    this.setPref("mcpPrefs", ws.userId, name, enabled);
    this.materializeWorkspaceTools(ws.worktree, ws.userId);
    this.invalidateWorkspaceRuns(ws.id);
    return this.mcpCatalog(workspaceId, actor);
  }

  saveUserSkill(
    actor: UserRecord,
    input: { name: string; description: string; body: string; paths?: string[]; manualOnly?: boolean },
  ) {
    if (!isSkillName(input.name)) throw new Error("Invalid skill name");
    writeSkillFile(userSkillsDir(this.storeDir(), actor.id), input);
    this.materializeForUser(actor.id);
    return this.listUserSkills(actor.id);
  }

  deleteUserSkill(actor: UserRecord, name: string) {
    deleteSkillFile(userSkillsDir(this.storeDir(), actor.id), name);
    this.materializeForUser(actor.id);
    return this.listUserSkills(actor.id);
  }

  listUserSkills(userId: string) {
    seedGlobalSkills(this.storeDir());
    return collectSkills({
      worktree: this.store.read().workspaces.find((row) => row.userId === userId && row.status !== "destroyed")?.worktree ?? "",
      storeDir: this.storeDir(),
      userId,
    }).skills.filter((skill) => skill.source === "user");
  }

  listGlobalSkills() {
    return seedGlobalSkills(this.storeDir());
  }

  listGlobalMcp() {
    return readPlatformMcp(this.storeDir()).map((entry) => redactMcpEntry(entry));
  }

  saveGlobalSkill(
    actor: UserRecord,
    input: { name: string; description: string; body: string; paths?: string[]; manualOnly?: boolean },
  ) {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    if (!isSkillName(input.name)) throw new Error("Invalid skill name");
    writeSkillFile(globalSkillsDir(this.storeDir()), input);
    this.materializeToolsEverywhere();
    return this.listGlobalSkills();
  }

  deleteGlobalSkill(actor: UserRecord, name: string) {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    deleteSkillFile(globalSkillsDir(this.storeDir()), name);
    this.materializeToolsEverywhere();
    return this.listGlobalSkills();
  }

  saveUserMcp(actor: UserRecord, raw: unknown) {
    const policy = readMcpPolicy(this.storeDir());
    const incoming = parseMcpConfig(raw, "user");
    for (const entry of incoming) {
      if (mcpPolicyDecision(entry, policy, { admin: this.isPlatformAdmin(actor) }) === "deny") {
        throw new Error("MCP server is not allowed by policy");
      }
    }
    const current = readUserMcp(this.storeDir(), actor.id);
    const restored = incoming.map((entry) => restoreMcpSecrets(entry, current.find((row) => row.name === entry.name)));
    writeUserMcp(this.storeDir(), actor.id, serializeMcpConfig(restored));
    this.materializeForUser(actor.id);
    return readUserMcp(this.storeDir(), actor.id).map((entry) => redactMcpEntry(entry));
  }

  upsertUserMcp(actor: UserRecord, name: string, config: unknown) {
    const current = readUserMcp(this.storeDir(), actor.id);
    const merged = serializeMcpConfig([...current.filter((row) => row.name !== name), ...parseMcpConfig({ mcpServers: { [name]: config } }, "user")]);
    return this.saveUserMcp(actor, merged);
  }

  deleteUserMcp(actor: UserRecord, name: string) {
    const next = readUserMcp(this.storeDir(), actor.id).filter((entry) => entry.name !== name);
    writeUserMcp(this.storeDir(), actor.id, serializeMcpConfig(next));
    this.materializeForUser(actor.id);
    return next.map((entry) => redactMcpEntry(entry));
  }

  saveGlobalMcp(actor: UserRecord, raw: unknown) {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const current = readPlatformMcp(this.storeDir());
    const incoming = parseMcpConfig(raw, "platform");
    const restored = incoming.map((entry) => restoreMcpSecrets(entry, current.find((row) => row.name === entry.name)));
    writePlatformMcp(this.storeDir(), serializeMcpConfig(restored));
    this.materializeToolsEverywhere();
    return readPlatformMcp(this.storeDir()).map((entry) => redactMcpEntry(entry));
  }

  getMcpPolicy() {
    return readMcpPolicy(this.storeDir());
  }

  saveMcpPolicy(actor: UserRecord, policy: { allowUserServers?: boolean; allowedCommands?: string[]; allowedUrlPatterns?: string[] }) {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const current = readMcpPolicy(this.storeDir());
    return writeMcpPolicy(this.storeDir(), {
      allowUserServers: policy.allowUserServers ?? current.allowUserServers,
      allowedCommands: policy.allowedCommands ?? current.allowedCommands,
      allowedUrlPatterns: policy.allowedUrlPatterns ?? current.allowedUrlPatterns,
    });
  }

  applySkillsAndMcp(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    this.materializeWorkspaceTools(ws.worktree, ws.userId);
    this.invalidateWorkspaceRuns(ws.id);
    return { id: workspaceId };
  }

  applySkillsAndMcpEverywhere() {
    this.materializeToolsEverywhere();
    return this.store.read().workspaces.filter((row) => row.status !== "destroyed").map((row) => ({ id: row.id }));
  }

  async probeMcp(actor: UserRecord, workspaceId: string, name: string) {
    const catalog = this.mcpCatalog(workspaceId, actor);
    const server = catalog.servers.find((row) => row.name === name);
    if (!server) throw new Error("MCP server not found");
    if (server.transport === "stdio") {
      const command = server.command ?? "";
      const ok = commandOnPath(command);
      return { name, ok, error: ok ? undefined : "command-missing" };
    }
    const url = server.url ?? "";
    if (!url) return { name, ok: false, error: "missing-url" };
    const started = Date.now();
    try {
      const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(4000) });
      return { name, ok: response.ok || response.status < 500, ms: Date.now() - started, error: response.ok ? undefined : `http-${response.status}` };
    } catch (error) {
      return { name, ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : "unreachable" };
    }
  }

  private setPref(kind: "skillPrefs" | "mcpPrefs", userId: string, name: string, enabled: boolean) {
    this.store.update((d) => {
      const list = d[kind];
      const row = list.find((item) => item.userId === userId && item.name === name);
      if (row) row.enabled = enabled;
      else list.push({ userId, name, enabled });
    });
  }

  private materializeWorkspaceTools(worktree: string, userId: string) {
    if (!worktree || !existsSync(worktree)) return;
    materializeSkills({
      worktree,
      storeDir: this.storeDir(),
      userId,
      prefs: this.store.read().skillPrefs,
    });
    mergeWorktreeMcp({
      worktree,
      storeDir: this.storeDir(),
      userId,
      prefs: this.store.read().mcpPrefs,
    });
  }

  private materializeForUser(userId: string) {
    const ws = this.store.read().workspaces.find((row) => row.userId === userId && row.status !== "destroyed");
    if (!ws) return;
    this.materializeWorkspaceTools(ws.worktree, userId);
    this.invalidateWorkspaceRuns(ws.id);
  }

  private materializeToolsEverywhere() {
    for (const ws of this.store.read().workspaces) {
      if (ws.status === "destroyed") continue;
      this.materializeWorkspaceTools(ws.worktree, ws.userId);
      this.invalidateWorkspaceRuns(ws.id);
    }
  }

  private invalidateWorkspaceRuns(workspaceId: string) {
    for (const session of this.sessions(workspaceId)) {
      this.runs.get(session.id)?.stop();
      this.runs.delete(session.id);
      this.runModes.delete(session.id);
      this.runFingerprints.delete(session.id);
    }
  }

  private workspaceToolsFingerprint(ws: WorkspaceRecord): string {
    const mcp = collectMcp({
      worktree: ws.worktree,
      storeDir: this.storeDir(),
      userId: ws.userId,
      prefs: this.store.read().mcpPrefs,
    });
    const skills = collectSkills({ worktree: ws.worktree, storeDir: this.storeDir(), userId: ws.userId });
    const prefs = this.store.read().skillPrefs;
    return JSON.stringify({
      mcp: mcpFingerprint(mcp.entries),
      skills: skills.skills
        .filter((skill) => prefs.find((row) => row.userId === ws.userId && row.name === skill.name)?.enabled !== false)
        .map((skill) => `${skill.source}:${skill.name}`),
    });
  }

  assertWorkspaceAccess(user: UserRecord, workspaceId: string, mode: "view" | "edit"): WorkspaceRecord {
    const ws = this.requireWorkspace(workspaceId);
    if (!this.canAccessWorkspace(user, ws, mode)) throw new Error("Forbidden");
    return ws;
  }

  workspaceDivergence(workspaceId: string) {
    const ws = this.requireWorkspace(workspaceId);
    const applied = this.store
      .read()
      .migrationLog.filter((row) => row.branch === ws.branch)
      .map((row) => ({ migration: row.name }));
    return worktreeDivergence(ws.worktree, applied);
  }

  evaluateShell(command: string, worktree: string) {
    return evaluatePermission({ kind: "shell", command, worktree });
  }

  requireWorkspace(id: string): WorkspaceRecord {
    const ws = this.store.read().workspaces.find((w) => w.id === id);
    if (!ws) throw new Error("Workspace not found");
    return ws;
  }

  private restoreRev(session: SessionRecord): string {
    const proposal = [...session.events].reverse().find((event) => event.type === "proposal");
    if (proposal && proposal.type === "proposal") return proposal.baseSha;
    const last = [...session.events].reverse().find((event) => event.type === "checkpoint" && event.gitSha && event.gitSha !== "fixture");
    return last && last.type === "checkpoint" ? `${last.gitSha}^` : "HEAD";
  }

  private attachmentBlocks(paths: string[], worktree?: string): AcpPromptBlock[] {
    const mimeByExt: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    const blocks: AcpPromptBlock[] = [];
    const uploadRoot = worktree ? join(worktree, "var", "uploads") : "";
    for (const path of paths) {
      if (worktree && uploadRoot && !path.startsWith(uploadRoot)) {
        blocks.push({ type: "text", text: `Attachment omitted: path is outside workspace uploads` });
        continue;
      }
      const mime = mimeByExt[extname(path).toLowerCase()];
      if (mime && existsSync(path)) {
        blocks.push({ type: "image", data: readFileSync(path).toString("base64"), mimeType: mime });
      } else {
        blocks.push({ type: "text", text: `Attachment: ${path}` });
      }
    }
    return blocks;
  }

  private replaceRule(record: RuleRecord) {
    const current = this.getRules();
    this.store.update((d) => {
      d.rules = [...current.filter((row) => row.id !== record.id), record];
    });
  }

  private rulesForWorktree(ownerId: string): RuleRecord[] {
    return rulesForActor(this.getRules(), ownerId);
  }

  private materializeOwnerRules(userId: string, locale: "en" | "pt-BR") {
    for (const ws of this.store.read().workspaces) {
      if (ws.status === "destroyed" || ws.userId !== userId || !existsSync(ws.worktree)) continue;
      this.materializeRules(ws.worktree, locale, this.rulesForWorktree(userId));
      this.invalidateWorkspaceRuns(ws.id);
    }
  }

  private readRepoAgents(worktree?: string): (RuleRecord & { editable: boolean; origin: "repo" }) | null {
    if (!worktree) return null;
    const file = join(worktree, "AGENTS.md");
    if (!existsSync(file)) return null;
    const body = readFileSync(file, "utf8").trim();
    if (!body) return null;
    return {
      id: "repo-agents",
      level: "project",
      title: "AGENTS.md",
      slug: "agents",
      description: "Repository agent instructions.",
      body: body.slice(0, 8000),
      alwaysApply: true,
      editable: false,
      origin: "repo",
    };
  }

  private materializeRulesEverywhere(locale: "en" | "pt-BR") {
    for (const ws of this.store.read().workspaces) {
      if (ws.status === "destroyed" || !existsSync(ws.worktree)) continue;
      this.materializeRules(ws.worktree, locale, this.rulesForWorktree(ws.userId));
    }
  }

  private materializeRules(worktree: string, locale: "en" | "pt-BR", layers: RuleRecord[]) {
    const compiled = compileRules(layers, locale);
    const dir = join(worktree, ".cursor", "rules");
    mkdirSync(dir, { recursive: true });
    const keep = new Set(compiled.files.map((file) => basename(file.path)));
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".mdc") || keep.has(name)) continue;
      unlinkSync(join(dir, name));
    }
    for (const file of compiled.files) {
      const target = join(worktree, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.contents);
    }
    const provenance = join(worktree, "var", "rule-provenance.json");
    mkdirSync(join(worktree, "var"), { recursive: true });
    writeFileSync(provenance, JSON.stringify(compiled.provenance, null, 2));
  }
}

function restoreMcpSecrets(incoming: McpEntry, current?: McpEntry): McpEntry {
  if (!current) return incoming;
  if (incoming.config.transport === "stdio" && current.config.transport === "stdio") {
    return {
      ...incoming,
      config: { ...incoming.config, env: restoreRedactedMcp(incoming.config.env, current.config.env) },
    };
  }
  if (incoming.config.transport !== "stdio" && current.config.transport !== "stdio") {
    return {
      ...incoming,
      config: { ...incoming.config, headers: restoreRedactedMcp(incoming.config.headers, current.config.headers) },
    };
  }
  return incoming;
}

function normalizeWorkspaceMemberRole(role?: string): WorkspaceMemberRole {
  if (!role) return "editor";
  if (isWorkspaceMemberRole(role)) return role;
  throw new Error("Invalid role");
}

function commandOnPath(command: string): boolean {
  if (!command) return false;
  if (command.includes("/") || command.includes("\\")) return existsSync(command);
  return (process.env.PATH ?? "").split(":").some((dir) => existsSync(join(dir, command)));
}

declare global {
  // eslint-disable-next-line no-var
  var __atelierPlatform: Platform | undefined;
}

export function getPlatform(): Platform {
  const current = globalThis.__atelierPlatform;
  if (
    !current ||
    typeof current.adminHibernate !== "function" ||
    typeof current.adminDestroy !== "function" ||
    typeof current.listAdminErrors !== "function" ||
    typeof current.getWorkspaceLogs !== "function" ||
    typeof current.setUserDisabled !== "function" ||
    typeof current.isPlatformAdmin !== "function" ||
    typeof current.skillCatalog !== "function" ||
    typeof current.mcpCatalog !== "function"
  ) {
    const created = new Platform(createPlatformStore());
    globalThis.__atelierPlatform = created;
    return created;
  }
  return current;
}

export const viewports: Record<Viewport, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1280, height: 800 },
};
