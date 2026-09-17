import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type {
  ClientCommand,
  ProviderId,
  Role,
  SessionEvent,
  UsageProfile,
  UsageSummary,
  Viewport,
} from "@atelier/contracts";
import { UsageProfileSchema } from "@atelier/contracts";
import {
  applyFileDecision,
  applyHunkDecision,
  budgetExceeded,
  canEdit,
  canInvite,
  canSpectate,
  canTransition,
  adminLoginsFromEnv,
  isPermanentPlatformAdmin,
  sameLogin,
  compileRules,
  defaultBudget,
  defaultDiskPolicy,
  defaultFlags,
  evaluatePermission,
  foldEvents,
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
  titleFromPrompt,
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
  billableTokens,
  defaultUsageProfileId,
  defaultUsageProfiles,
  evaluateUsage,
  mergeRollups,
  resolveUsageProfile,
  rollupFromEntries,
  runBudgetFromProfile,
  splitExpiredEntries,
  summarizeUsage,
  usageDayKey,
  usagePeriodKey,
  usageRetentionDays,
  usageTimezone,
  type McpEntry,
  type UsageLedgerEntry,
} from "@atelier/domain";
import { bus } from "./bus.js";
import { type PlatformStore, type RuleRecord, type SessionRecord, type UserRecord, type WorkspaceRecord } from "./store.js";
import { createPlatformStore } from "./store-factory.js";
import { hasCursorApiKey, implementedProviders, preferredAgentProvider, resolveSessionProvider } from "./providers/env.js";
import { providerSecretKey } from "./providers/credentials.js";
import { inspectProviderHealth, isProviderSelectable, listProviderHealth } from "./providers/health.js";
import { findCursorAgentBinary } from "./providers/ensure-agent.js";
import { createProvider, listProviders as catalogProviders } from "./providers/index.js";
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
  private readonly runMeters = new Map<string, { meter: RunMeter; profile: UsageProfile; enforce: boolean }>();

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
    return catalogProviders().filter((provider) => {
      if (!implemented.includes(provider.id)) return false;
      if (provider.id === "mock") return Boolean(process.env.VITEST);
      if (provider.id === "cursor") return enabled.cursor?.enabled !== false;
      if (!canaryOk) return false;
      if (enabled[provider.id]?.enabled !== true) return false;
      return isProviderSelectable(provider.id, flags, process.env, this.envRoot());
    });
  }

  roleFor(user: UserRecord, projectId = "concreserv"): Role {
    return this.store.read().members.find((m) => m.userId === user.id && m.projectId === projectId)?.role ?? user.role;
  }

  canAccessWorkspace(user: UserRecord, workspace: WorkspaceRecord, mode: "view" | "edit"): boolean {
    if (workspace.userId === user.id) return true;
    const role = this.roleFor(user, workspace.projectId);
    return mode === "view" ? canSpectate(role) : canEdit(role);
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
    this.hydrateProjectRules(worktree);
    this.materializeRules(worktree, user.locale, this.getRules());
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
      if (row) {
        row.warmedAt = new Date().toISOString();
        row.status = "ready";
        row.desired = "ready";
      }
    });
    return ws;
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

  async hibernate(workspaceId: string): Promise<WorkspaceRecord> {
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
    session.events.push(event);
    this.store.write(db);
    bus.publish({ ...event, sessionId, workspaceId: session.workspaceId });
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
    const canWrite = ws.userId === input.user.id || canEdit(this.roleFor(input.user, ws.projectId));
    const spectator = Boolean(input.spectator || presence?.mode === "spectator" || !canWrite);
    if (spectator && input.command.type === "prompt") {
      throw new Error("Spectators cannot send prompts");
    }
    if (spectator && input.command.type !== "prompt") return;

    if (input.command.type === "prompt") {
      const prompt = input.command;
      this.assertUsageAllowed(input.user, session, prompt);
      await this.enqueueWorkspace(ws.id, () => this.runPrompt(input.user, session, ws, prompt));
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
      await this.enqueueWorkspace(ws.id, () =>
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
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id);
        if (!s) return;
        s.events = s.events.map((e) => (e.type === "plan" && e.outcome === "pending" ? { ...e, outcome } : e));
      });
      if (outcome === "accepted") {
        await this.enqueueWorkspace(ws.id, () =>
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
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id);
        if (!s) return;
        s.events = s.events.map((e) => (e.type === "permission" && e.outcome === "pending" ? { ...e, outcome } : e));
      });
      return;
    }
    if (input.command.type === "answer_question") {
      const answers = input.command.answers;
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id);
        if (!s) return;
        s.events = s.events.map((e) => (e.type === "question" ? { ...e, outcome: "answered" } : e));
      });
      await this.enqueueWorkspace(ws.id, () =>
        this.runPrompt(input.user, session, ws, {
          type: "prompt",
          text: `Question answers: ${JSON.stringify(answers)}`,
          attachments: [],
          mentions: [],
        }),
      );
    }
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
    if (!isFlagOn(this.flags(), "workspaceQueue")) return fn();
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
    const pendingTokens = estimateTokens(command.text) + command.mentions.length * 256;
    const summary = this.usageSummary(user.id, {
      pendingTokens,
      provider: resolveSessionProvider(session.provider),
    });
    if (summary.decision.decision !== "block") return;
    const reason = summary.decision.reason === "perRun" ? "tokens" : "period";
    this.append(session.id, {
      type: "budget",
      id: randomUUID(),
      at: new Date().toISOString(),
      reason,
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
    const existing = this.store.read().runLock[ws.id];
    if (existing && !canAcquireLease(existing as { sessionId: string; userId: string; leaseUntil: string }, session.id)) {
      throw new Error("Workspace is busy");
    }
    if (isFlagOn(flags, "transactionalReview") && hasPendingProposal(this.snapshot(session.id).hunks)) {
      throw new Error("Workspace has a pending change proposal");
    }
    const lease = createLease(session.id, user.id);
    this.store.update((d) => {
      d.runLock[ws.id] = lease;
    });

    const recipe = command.recipeId
      ? this.store.read().recipes.find((r) => r.id === command.recipeId)
      : undefined;
    const filled = recipe
      ? recipe.template.replaceAll("{{model}}", command.text)
      : command.text;
    const agentText = currentRequestText(`${promptPrefixForMode(command.mode)}${filled}`);
    const runId = randomUUID();

    if (session.events.length === 0) {
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id)!;
        s.title = titleFromPrompt(filled);
      });
    }

    this.append(session.id, {
      type: "user_message",
      id: randomUUID(),
      at: new Date().toISOString(),
      text: filled,
      attachments: command.attachments,
      mentions: command.mentions,
      skill: command.skill ?? slashInvocation(filled) ?? undefined,
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

    const rules = compileRules(this.getRules(), user.locale);
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
    const usageProfile = this.usageProfileFor(user);
    const usageLimitsOn = isFlagOn(flags, "usageLimits");
    const meter = createRunMeter(packed.usedTokens);
    // The ACP process and its `onEvent` closure outlive a single prompt, so the
    // meter for the current run has to be looked up per event, not captured.
    this.runMeters.set(session.id, { meter, profile: usageProfile, enforce: usageLimitsOn });
    const budget = usageLimitsOn ? runBudgetFromProfile(usageProfile) : defaultBudget();
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
      run.stop();
      this.runs.delete(session.id);
      this.runModes.delete(session.id);
      this.runFingerprints.delete(session.id);
      run = undefined;
    }
    try {
      this.promptText.reset(session.id);
      if (!run) {
        const provider = this.providerFactory(providerId);
        run = await provider.start({
          cwd: ws.worktree,
          resumeSessionId: session.acpSessionId,
          mode,
          sandbox: isFlagOn(flags, "sandboxedAgent"),
          sandboxProfile: resolveSandboxProfile(flags),
          mcpServers: acpServersForWorktree({
            worktree: ws.worktree,
            storeDir: this.storeDir(),
            userId: ws.userId,
            prefs: this.store.read().mcpPrefs,
          }),
          onEvent: (event) => {
            // The ACP process is reused across prompts, so this closure must
            // write the session buffer — not a `let streamed` from the first start.
            if (event.type === "assistant_delta") this.promptText.append(session.id, event.text);
            const metered = this.runMeters.get(session.id);
            if (metered) meterSessionEvent(metered.meter, event);
            usage.toolCalls += event.type === "tool_call" ? 1 : 0;
            if (event.type === "tool_call") {
              this.store.update((d) => {
                const current = d.runLock[ws.id];
                if (current) d.runLock[ws.id] = heartbeatLease(createLease(current.sessionId, current.userId));
              });
            }
            const perRunTokens = metered?.profile.limits.perRunTokens ?? 0;
            if (metered?.enforce && perRunTokens > 0 && meterBillableTokens(metered.meter, metered.profile) > perRunTokens) {
              this.append(session.id, {
                type: "budget",
                id: randomUUID(),
                at: new Date().toISOString(),
                reason: "tokens",
                message: "Run stopped: per-run token limit reached",
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
          },
          onPermission: (event, rpcId) => {
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
          },
        });
        this.runs.set(session.id, run);
        this.runModes.set(session.id, mode);
        this.runFingerprints.set(session.id, fingerprint);
        if (run.acpSessionId) {
          this.store.update((d) => {
            const row = d.sessions.find((s) => s.id === session.id);
            if (row) row.acpSessionId = run!.acpSessionId;
          });
        }
      }
      const attachmentBlocks = this.attachmentBlocks(command.attachments, ws.worktree);
      meter.inputTokens += estimatePromptBlockTokens(attachmentBlocks);
      const blocks: AcpPromptBlock[] = [{ type: "text", text: packed.text }, ...attachmentBlocks];
      const statesBefore = await worktreeFileStates(ws.worktree);
      const fingerprintBefore = await worktreeFingerprint(ws.worktree);
      this.promptText.reset(session.id);
      await run.prompt(blocks);
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
      run?.stop();
      this.runs.delete(session.id);
      this.runModes.delete(session.id);
      this.runFingerprints.delete(session.id);
      this.append(session.id, {
        type: "assistant_message",
        id: randomUUID(),
        at: new Date().toISOString(),
        text: `The agent could not complete this prompt. ${formatAgentError(error)}`,
        streaming: false,
      });
      this.append(session.id, {
        type: "run_failure",
        id: randomUUID(),
        at: new Date().toISOString(),
        v: 1,
        kind: "provider_failed",
        message: formatAgentError(error),
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

  createInvite(user: UserRecord): { token: string; url: string } {
    if (!canInvite(this.roleFor(user))) throw new Error("Forbidden");
    const token = randomBytes(16).toString("hex");
    this.store.update((d) => {
      d.invites.push({
        id: randomUUID(),
        token,
        projectId: "concreserv",
        createdBy: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      });
    });
    return { token, url: `/invite/${token}` };
  }

  acceptInvite(token: string, user: UserRecord): { pending: boolean } {
    const invite = this.store.read().invites.find((i) => i.token === token);
    if (!invite) throw new Error("Invite not found");
    if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error("Invite expired");
    if (user.accessPending) return { pending: true };
    this.store.update((d) => {
      const row = d.invites.find((i) => i.token === token)!;
      row.acceptedBy = user.id;
      if (!d.members.some((m) => m.userId === user.id)) {
        d.members.push({ userId: user.id, projectId: invite.projectId, role: user.role });
      }
    });
    return { pending: false };
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
    return this.store.read().rules;
  }

  saveRules(layers: RuleRecord[], locale: "en" | "pt-BR", worktree?: string) {
    this.store.update((d) => {
      d.rules = layers;
    });
    if (worktree) this.materializeRules(worktree, locale, layers);
  }

  saveRulesFromActor(actor: UserRecord, layers: RuleRecord[], locale: "en" | "pt-BR", worktree?: string) {
    const current = this.getRules();
    const next = this.isPlatformAdmin(actor)
      ? layers
      : current.map((row) => (row.level === "user" ? (layers.find((layer) => layer.id === row.id) ?? row) : row));
    this.saveRules(next, locale, worktree);
    return this.getRules();
  }

  saveAdminRules(layers: RuleRecord[], locale: "en" | "pt-BR") {
    const userLayers = this.getRules().filter((row) => row.level === "user");
    const next = [...layers.filter((row) => row.level !== "user"), ...userLayers];
    this.store.update((d) => {
      d.rules = next;
    });
    this.materializeRulesEverywhere(locale, next);
    return this.getRules();
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
      cursorKey: hasCursorApiKey(process.env, this.envRoot()),
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
    return stored.length ? stored : defaultUsageProfiles();
  }

  usageProfileFor(user: { id: string; usageProfileId?: string }): UsageProfile {
    return resolveUsageProfile(user, this.usageProfiles(), defaultUsageProfileId());
  }

  saveUsageProfiles(actor: UserRecord, profiles: unknown): UsageProfile[] {
    if (!this.isPlatformAdmin(actor)) throw new Error("Forbidden");
    const parsed = UsageProfileSchema.array().min(1).parse(profiles);
    const ids = new Set(parsed.map((row) => row.id));
    if (ids.size !== parsed.length) throw new Error("Duplicate profile id");
    this.store.update((d) => {
      d.usageProfiles = parsed.map((row) => ({ ...d.usageProfiles.find((current) => current.id === row.id), ...row }));
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

  providerConfig(): Record<string, { enabled: boolean }> {
    return this.store.read().providers;
  }

  getProviderSettings() {
    const config = this.providerConfig();
    const flags = this.flags();
    const implemented = new Set(implementedProviders());
    return PROVIDER_CATALOG.filter((row) => row.id !== "mock" || process.env.VITEST).map((row) => {
      const health = inspectProviderHealth(row.id, flags, process.env, this.envRoot());
      return {
        id: row.id,
        label: row.label,
        enabled: row.id === "cursor" ? config.cursor?.enabled !== false : Boolean(config[row.id]?.enabled),
        implemented: implemented.has(row.id),
        hasKey: health.hasCredential,
        health: health.status,
        sandbox: health.sandbox,
        message: health.message,
      };
    });
  }

  saveProviderSettings(input: { id: string; enabled?: boolean; apiKey?: string }) {
    if (input.enabled != null) {
      this.store.update((d) => {
        d.providers = { ...d.providers, [input.id]: { enabled: input.enabled! } };
      });
    }
    if (input.apiKey != null) {
      const secrets = readProviderSecrets(this.envRoot());
      const keyName = providerSecretKey(input.id);
      if (input.apiKey.trim()) secrets[keyName] = input.apiKey.trim();
      else delete secrets[keyName];
      writeProviderSecrets(secrets, this.envRoot());
    }
    return this.getProviderSettings();
  }

  providerHealth() {
    return listProviderHealth(this.flags(), process.env, this.envRoot());
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

  private hydrateProjectRules(worktree: string) {
    const file = join(worktree, "AGENTS.md");
    if (!existsSync(file)) return;
    const body = readFileSync(file, "utf8").trim();
    if (!body) return;
    this.store.update((d) => {
      const project = d.rules.find((rule) => rule.level === "project");
      if (!project) {
        d.rules.push({ id: "project", level: "project", title: "Project", body: body.slice(0, 8000) });
        return;
      }
      if (project.body.includes("Follow Inertia + Vue page conventions")) {
        project.body = body.slice(0, 8000);
      }
    });
  }

  private materializeRulesEverywhere(locale: "en" | "pt-BR", layers = this.getRules()) {
    for (const ws of this.store.read().workspaces) {
      if (ws.status === "destroyed" || !existsSync(ws.worktree)) continue;
      this.materializeRules(ws.worktree, locale, layers);
    }
  }

  private materializeRules(worktree: string, locale: "en" | "pt-BR", layers = this.getRules()) {
    const compiled = compileRules(layers, locale);
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
