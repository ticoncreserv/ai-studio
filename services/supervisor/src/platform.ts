import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { ClientCommand, ProviderId, Role, SessionEvent, Viewport } from "@atelier/contracts";
import {
  applyFileDecision,
  applyHunkDecision,
  budgetExceeded,
  canEdit,
  canInvite,
  canSpectate,
  canTransition,
  adminLoginsFromEnv,
  compileRules,
  defaultBudget,
  defaultDiskPolicy,
  defaultFlags,
  evaluatePermission,
  foldEvents,
  isPlatformAdmin as matchPlatformAdmin,
  mapGitHubPermission,
  packPrompt,
  estimateTokens,
  reduceSession,
  shouldCollect,
  shouldHibernate,
  titleFromPrompt,
  transition,
} from "@atelier/domain";
import { bus } from "./bus.js";
import { JsonStore, type RuleRecord, type SessionRecord, type UserRecord, type WorkspaceRecord } from "./store.js";
import { hasCursorApiKey, preferredAgentProvider, resolveSessionProvider } from "./providers/env.js";
import { createProvider, listProviders as catalogProviders } from "./providers/index.js";
import { PROVIDER_CATALOG } from "./providers/types.js";
import { fixtureAppDir, repoRoot } from "./paths.js";
import { applyHunkToWorktree, DockerRuntime, ProcessRuntime, type WorkspaceRuntime } from "./runtime/process.js";
import { worktreeDivergence } from "./migrations.js";
import { defaultWorkspaceSpec, isolationEnv, PREVIEW_SIDE_EFFECTS, validateEnvContract } from "./runtime/spec.js";
import { atelierPublicUrl, githubAppRepo, hasGitHubOAuth, loadGitHubAppCredentials } from "./github-app.js";
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
import {
  commitWorktree,
  restoreCheckpoint,
  restoreFile,
  syncBaseBranch,
  worktreeDiffEvents,
  worktreeFingerprint,
} from "./runtime/worktree-diff.js";
import { formatAgentError } from "./acp/errors.js";
import type { AcpPromptBlock } from "./acp/session.js";
import type { ProviderRun } from "./providers/types.js";

export class Platform {
  readonly store: JsonStore;
  readonly runtime: WorkspaceRuntime;
  private readonly runs = new Map<string, ProviderRun>();
  private readonly runModes = new Map<string, "agent" | "plan" | "ask">();
  private readonly pendingPermissions = new Map<string, { rpcId: number; respond: ProviderRun["respondPermission"] }>();

  constructor(store = new JsonStore(join(repoRoot(), "var", "platform.json"))) {
    this.store = store;
    this.runtime = process.env.ATELIER_RUNTIME === "docker" ? new DockerRuntime() : new ProcessRuntime();
  }

  flags() {
    return { ...defaultFlags, ...this.store.read().flags };
  }

  envRoot(): string {
    return join(dirname(this.store.path), "env");
  }

  hasExplicitAdmin(): boolean {
    const db = this.store.read();
    return db.users.some((user) => typeof user.platformAdmin === "boolean") || adminLoginsFromEnv().length > 0;
  }

  isPlatformAdmin(user: UserRecord): boolean {
    const row = this.store.read().users.find((item) => item.id === user.id) ?? user;
    return matchPlatformAdmin(row, {
      hasExplicitAdmin: this.hasExplicitAdmin(),
      envLogins: adminLoginsFromEnv(),
    });
  }

  listProviders() {
    const enabled = this.providerConfig();
    return catalogProviders().filter((provider) => {
      if (provider.id === "mock") return Boolean(process.env.VITEST);
      if (provider.id !== "cursor") return false;
      return enabled.cursor?.enabled !== false;
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
    await this.warmForUser(user);
    return user;
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
        row.lastActiveAt = new Date().toISOString();
      });
    } catch (error) {
      await this.runtime.hibernate(workspaceId).catch(() => undefined);
      this.store.update((d) => {
        const row = d.workspaces.find((w) => w.id === workspaceId);
        if (!row) return;
        row.status = "error";
        row.desired = "running";
        row.port = undefined;
        row.vitePort = undefined;
        row.lastError = error instanceof Error ? error.message : String(error);
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
  }

  sessions(workspaceId: string, query?: string): SessionRecord[] {
    const list = this.store.read().sessions.filter((s) => s.workspaceId === workspaceId);
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((s) => s.title.toLowerCase().includes(q) || s.events.some((e) => "text" in e && String(e.text).toLowerCase().includes(q)));
  }

  setSessionProvider(sessionId: string, provider: ProviderId): SessionRecord {
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
    if (event.type === "assistant_delta") {
      bus.publish({ ...event, sessionId, workspaceId: session.workspaceId });
      return;
    }
    session.events.push(event);
    this.store.write(db);
    bus.publish({ ...event, sessionId, workspaceId: session.workspaceId });
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
      await this.runPrompt(input.user, session, ws, input.command);
      return;
    }
    if (input.command.type === "cancel") {
      await this.runs.get(session.id)?.cancel();
      return;
    }
    if (input.command.type === "accept_hunk" || input.command.type === "reject_hunk") {
      const hunkId = input.command.hunkId;
      const accepted = input.command.type === "accept_hunk";
      const state = this.snapshot(session.id);
      const hunk = state.hunks.find((h) => h.id === hunkId);
      this.mutateHunks(session.id, (next) => applyHunkDecision(next, hunkId, accepted ? "accepted" : "rejected"));
      if (accepted && hunk) applyHunkToWorktree(ws.worktree, hunk.filePath, hunk.newLines);
      if (!accepted && hunk) await restoreFile(ws.worktree, hunk.filePath, this.restoreRev(session));
      return;
    }
    if (input.command.type === "accept_file" || input.command.type === "reject_file") {
      const filePath = input.command.filePath;
      const accepted = input.command.type === "accept_file";
      this.mutateHunks(session.id, (state) => applyFileDecision(state, filePath, accepted ? "accepted" : "rejected"));
      if (accepted) this.applyAcceptedHunks(session.id, ws.worktree);
      if (!accepted) await restoreFile(ws.worktree, filePath, this.restoreRev(session));
      return;
    }
    if (input.command.type === "sync_base") {
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
      return;
    }
    if (input.command.type === "fix_error") {
      const lastError = [...session.events].reverse().find((e) => e.type === "runtime_error");
      await this.runPrompt(input.user, session, ws, {
        type: "prompt",
        text: `Fix this preview error: ${lastError && lastError.type === "runtime_error" ? lastError.message : input.command.eventId}`,
        attachments: [],
        mentions: [],
      });
      return;
    }
    if (input.command.type === "restore_checkpoint") {
      const command = input.command;
      const checkpoint = session.events.find((e) => e.type === "checkpoint" && e.id === command.checkpointId);
      const sha = checkpoint && checkpoint.type === "checkpoint" ? checkpoint.gitSha : command.checkpointId;
      await restoreCheckpoint(ws.worktree, sha, { name: input.user.name, email: input.user.email });
      this.append(session.id, {
        type: "checkpoint",
        id: randomUUID(),
        at: new Date().toISOString(),
        gitSha: sha,
        label: `Restored ${sha.slice(0, 8)}`,
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
        await this.runPrompt(input.user, session, ws, {
          type: "prompt",
          text: "The plan was accepted. Continue implementing it.",
          attachments: [],
          mentions: [],
        });
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
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id);
        if (!s) return;
        s.events = s.events.map((e) => (e.type === "question" ? { ...e, outcome: "answered" } : e));
      });
      await this.runPrompt(input.user, session, ws, {
        type: "prompt",
        text: `Question answers: ${JSON.stringify(input.command.answers)}`,
        attachments: [],
        mentions: [],
      });
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

  private applyAcceptedHunks(sessionId: string, worktree: string) {
    const state = this.snapshot(sessionId);
    for (const hunk of state.hunks.filter((h) => h.status === "accepted")) {
      applyHunkToWorktree(worktree, hunk.filePath, hunk.newLines);
    }
  }

  private async runPrompt(
    user: UserRecord,
    session: SessionRecord,
    ws: WorkspaceRecord,
    command: Extract<ClientCommand, { type: "prompt" }>,
  ) {
    const lock = this.store.read().runLock[ws.id];
    if (lock && lock.sessionId !== session.id) {
      throw new Error("Workspace is busy");
    }
    this.store.update((d) => {
      d.runLock[ws.id] = { sessionId: session.id, userId: user.id };
    });

    const recipe = command.recipeId
      ? this.store.read().recipes.find((r) => r.id === command.recipeId)
      : undefined;
    const filled = recipe
      ? recipe.template.replaceAll("{{model}}", command.text)
      : command.text;
    const prefix =
      command.mode === "plan"
        ? "Create a plan only. Do not edit files.\n\n"
        : command.mode === "ask"
          ? "Answer only. Do not edit files.\n\n"
          : "";
    const userText = `${prefix}${filled}`;

    if (session.events.length === 0) {
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id)!;
        s.title = titleFromPrompt(userText);
      });
    }

    this.append(session.id, {
      type: "user_message",
      id: randomUUID(),
      at: new Date().toISOString(),
      text: userText,
      attachments: command.attachments,
      mentions: command.mentions,
    });

    const rules = compileRules(this.getRules(), user.locale);
    const packed = packPrompt(
      [
        { id: "user", kind: "user", text: userText, tokens: estimateTokens(userText), priority: 0 },
        { id: "rules", kind: "rules", text: rules.markdown, tokens: estimateTokens(rules.markdown), priority: 1 },
        ...command.mentions.map((m, i) => ({
          id: m,
          kind: "mentions" as const,
          text: `@${m}`,
          tokens: estimateTokens(m),
          priority: 2 + i,
        })),
      ],
      4000,
    );
    if (packed.omitted.length) {
      this.append(session.id, {
        type: "dropped_context",
        id: randomUUID(),
        at: new Date().toISOString(),
        omitted: packed.omitted,
      });
    }

    const usage = { startedAt: Date.now(), toolCalls: 0, costUsd: 0 };
    const budget = defaultBudget();
    const providerId = resolveSessionProvider(session.provider);
    if (providerId !== session.provider) this.setSessionProvider(session.id, providerId);
    const mode = command.mode ?? "agent";
    let streamed = "";
    let run = this.runs.get(session.id);
    if (run && this.runModes.get(session.id) !== mode) {
      run.stop();
      this.runs.delete(session.id);
      this.runModes.delete(session.id);
      run = undefined;
    }
    try {
      if (!run) {
        const provider = createProvider(providerId);
        run = await provider.start({
          cwd: ws.worktree,
          resumeSessionId: session.acpSessionId,
          mode,
          onEvent: (event) => {
            if (event.type === "assistant_delta") streamed += event.text;
            usage.toolCalls += event.type === "tool_call" ? 1 : 0;
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
            this.append(session.id, event);
          },
          onPermission: (event, rpcId) => {
            this.append(session.id, event);
            this.pendingPermissions.set(session.id, {
              rpcId,
              respond: this.runs.get(session.id)?.respondPermission,
            });
          },
        });
        this.runs.set(session.id, run);
        this.runModes.set(session.id, mode);
        if (run.acpSessionId) {
          this.store.update((d) => {
            const row = d.sessions.find((s) => s.id === session.id);
            if (row) row.acpSessionId = run!.acpSessionId;
          });
        }
      }
      const blocks: AcpPromptBlock[] = [{ type: "text", text: packed.text }, ...this.attachmentBlocks(command.attachments)];
      const fingerprintBefore = await worktreeFingerprint(ws.worktree);
      await run.prompt(blocks);
      if (streamed.trim()) {
        this.append(session.id, {
          type: "assistant_message",
          id: randomUUID(),
          at: new Date().toISOString(),
          text: streamed.trim(),
          streaming: false,
        });
      }
      try {
        if ((await worktreeFingerprint(ws.worktree)) === fingerprintBefore) return;
        for (const event of await worktreeDiffEvents(ws.worktree)) this.append(session.id, event);
        const sha = await commitWorktree(ws.worktree, { name: user.name, email: user.email }, titleFromPrompt(userText));
        if (sha) {
          this.append(session.id, {
            type: "checkpoint",
            id: randomUUID(),
            at: new Date().toISOString(),
            gitSha: sha,
            label: titleFromPrompt(userText),
          });
        }
        const bytes = await worktreeBytes(ws.worktree);
        this.store.update((d) => {
          const row = d.workspaces.find((w) => w.id === ws.id);
          if (row) row.bytes = bytes;
        });
      } catch {
        // The prompt already completed. A worktree scan must not look like an agent failure
        // or remount the preview when no app files changed.
      }
    } catch (error) {
      run?.stop();
      this.runs.delete(session.id);
      this.runModes.delete(session.id);
      this.append(session.id, {
        type: "assistant_message",
        id: randomUUID(),
        at: new Date().toISOString(),
        text: `The agent could not complete this prompt. ${formatAgentError(error)}`,
        streaming: false,
      });
    } finally {
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
    const lastError = [...workspaces].reverse().find((row) => row.lastError)?.lastError ?? null;
    return {
      githubConfigured: Boolean(loadGitHubAppCredentials() || hasGitHubOAuth()),
      cursorKey: hasCursorApiKey(),
      publicUrl: atelierPublicUrl(),
      users: db.users.length,
      running: workspaces.filter((row) => row.status === "running").length,
      hibernated: workspaces.filter((row) => row.status === "hibernated").length,
      error: workspaces.filter((row) => row.status === "error").length,
      lastPreviewError: lastError,
      flags: this.flags(),
    };
  }

  listUsers() {
    const db = this.store.read();
    return db.users.map((user) => {
      const workspace = db.workspaces.find((row) => row.userId === user.id && row.status !== "destroyed");
      return {
        id: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        role: this.roleFor(user),
        accessPending: Boolean(user.accessPending),
        platformAdmin: this.isPlatformAdmin(user),
        envAdmin: adminLoginsFromEnv().includes(user.login),
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
    if (adminLoginsFromEnv().includes(target.login) && !value) {
      throw new Error("Cannot revoke an env-listed admin");
    }
    const currentAdmins = db.users.filter((row) => this.isPlatformAdmin(row));
    if (!value) {
      const remaining = currentAdmins.filter((row) => row.id !== userId).length;
      const envOthers = adminLoginsFromEnv().filter((login) => login !== target.login).length;
      if (remaining + envOthers === 0) {
        throw new Error("Cannot remove the last platform admin");
      }
    }
    const bootstrapping = !this.hasExplicitAdmin();
    this.store.update((d) => {
      if (bootstrapping) {
        for (const user of d.users) {
          if (user.id === userId) continue;
          if (currentAdmins.some((admin) => admin.id === user.id)) user.platformAdmin = true;
        }
      }
      const row = d.users.find((user) => user.id === userId);
      if (row) row.platformAdmin = value;
    });
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
          lastActiveAt: row.lastActiveAt,
          port: row.port ?? null,
        };
      });
  }

  async adminHibernate(workspaceId: string) {
    return this.hibernate(workspaceId);
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
      secrets: Object.keys(env).filter((key) => /password|secret|token|key|private/i.test(key) && !key.endsWith("_NAME")),
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
    return { env: redactEnv(env), raw: serializeEnvFile(redactEnv(env)) };
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
    const secrets = readProviderSecrets(this.envRoot());
    const implemented = new Set(["cursor", ...(process.env.VITEST ? ["mock"] : [])]);
    return PROVIDER_CATALOG.filter((row) => row.id !== "mock" || process.env.VITEST).map((row) => ({
      id: row.id,
      label: row.label,
      enabled: row.id === "cursor" ? config.cursor?.enabled !== false : Boolean(config[row.id]?.enabled),
      implemented: implemented.has(row.id),
      hasKey: row.id === "cursor" ? hasCursorApiKey() : Boolean(secrets[`${row.id.toUpperCase()}_API_KEY`]?.trim()),
    }));
  }

  saveProviderSettings(input: { id: string; enabled?: boolean; apiKey?: string }) {
    if (input.enabled != null) {
      this.store.update((d) => {
        d.providers = { ...d.providers, [input.id]: { enabled: input.enabled! } };
      });
    }
    if (input.apiKey != null) {
      const secrets = readProviderSecrets(this.envRoot());
      const keyName = input.id === "cursor" ? "CURSOR_API_KEY" : `${input.id.toUpperCase()}_API_KEY`;
      if (input.apiKey.trim()) secrets[keyName] = input.apiKey.trim();
      else delete secrets[keyName];
      writeProviderSecrets(secrets, this.envRoot());
    }
    return this.getProviderSettings();
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
    const ready = hasCursorApiKey();
    return {
      ready,
      provider: this.preferredProvider(),
      error: ready || process.env.VITEST ? null : "CURSOR_API_KEY is not set",
    };
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
    const last = [...session.events].reverse().find((event) => event.type === "checkpoint" && event.gitSha && event.gitSha !== "fixture");
    return last && last.type === "checkpoint" ? `${last.gitSha}^` : "HEAD";
  }

  private attachmentBlocks(paths: string[]): AcpPromptBlock[] {
    const mimeByExt: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    const blocks: AcpPromptBlock[] = [];
    for (const path of paths) {
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

declare global {
  // eslint-disable-next-line no-var
  var __atelierPlatform: Platform | undefined;
}

export function getPlatform(): Platform {
  const current = globalThis.__atelierPlatform;
  if (!current || typeof current.adminHibernate !== "function") {
    globalThis.__atelierPlatform = new Platform();
  }
  return globalThis.__atelierPlatform;
}

export const viewports: Record<Viewport, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1280, height: 800 },
};
