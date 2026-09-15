import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ClientCommand, ProviderId, Role, SessionEvent, Viewport } from "@atelier/contracts";
import {
  applyFileDecision,
  applyHunkDecision,
  budgetExceeded,
  compileRules,
  defaultBudget,
  defaultDiskPolicy,
  defaultFlags,
  evaluatePermission,
  foldEvents,
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
import { JsonStore, type SessionRecord, type UserRecord, type WorkspaceRecord } from "./store.js";
import { createProvider, listProviders } from "./providers/index.js";
import { fixtureAppDir, repoRoot } from "./paths.js";
import { applyHunkToWorktree, DockerRuntime, ProcessRuntime, type WorkspaceRuntime } from "./runtime/process.js";
import { defaultWorkspaceSpec, isolationEnv, PREVIEW_SIDE_EFFECTS, validateEnvContract } from "./runtime/spec.js";

export class Platform {
  readonly store: JsonStore;
  readonly runtime: WorkspaceRuntime;
  private readonly runs = new Map<string, { cancel: () => Promise<void>; stop: () => void }>();

  constructor(store = new JsonStore(join(repoRoot(), "var", "platform.json"))) {
    this.store = store;
    this.runtime = process.env.ATELIER_RUNTIME === "docker" ? new DockerRuntime() : new ProcessRuntime();
  }

  flags() {
    return { ...defaultFlags, ...this.store.read().flags };
  }

  listProviders() {
    return listProviders().filter((p) => p.id === "mock" || p.id === "cursor" || this.flags().multiProvider);
  }

  async loginDev(login: string, locale: "en" | "pt-BR" = "en"): Promise<UserRecord> {
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
        d.members.push({ userId: user!.id, projectId: "concreserv", role: "owner" });
      });
    }
    await this.warmForUser(user);
    return user;
  }

  authorizeGitHub(permissions: Parameters<typeof mapGitHubPermission>[0]): Role | null {
    return mapGitHubPermission(permissions);
  }

  async ensureWorkspace(user: UserRecord): Promise<WorkspaceRecord> {
    const db = this.store.read();
    let ws = db.workspaces.find((w) => w.userId === user.id && w.status !== "destroyed");
    if (ws) return ws;
    const id = randomUUID();
    const branch = `user/${user.login}/studio`;
    const sourceDir = fixtureAppDir();
    const { worktree } = await this.runtime.provision({
      workspaceId: id,
      branch,
      sourceDir,
      user: { name: user.name, email: user.email },
    });
    this.materializeRules(worktree, user.locale);
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
    };
    this.store.update((d) => d.workspaces.push(ws!));
    return ws;
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
    const handle = await this.runtime.start({ workspaceId, worktree: ws.worktree });
    this.store.update((d) => {
      const row = d.workspaces.find((w) => w.id === workspaceId)!;
      row.status = transition(row.status === "hibernated" || row.status === "ready" ? row.status : "ready", "running");
      row.desired = "running";
      row.port = handle.port;
      row.lastActiveAt = new Date().toISOString();
    });
    return this.requireWorkspace(workspaceId);
  }

  async hibernate(workspaceId: string): Promise<void> {
    await this.runtime.hibernate(workspaceId);
    this.store.update((d) => {
      const row = d.workspaces.find((w) => w.id === workspaceId);
      if (row && row.status === "running") {
        row.status = transition("running", "hibernated");
        row.desired = "hibernated";
      }
    });
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

  createSession(workspaceId: string, provider: ProviderId = "mock"): SessionRecord {
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

    if (input.spectator) {
      if (input.command.type !== "prompt") return;
      throw new Error("Spectators cannot send prompts");
    }

    if (input.command.type === "prompt") {
      await this.runPrompt(input.user, session, ws, input.command);
      return;
    }
    if (input.command.type === "cancel") {
      await this.runs.get(session.id)?.cancel();
      return;
    }
    if (input.command.type === "accept_hunk" || input.command.type === "reject_hunk") {
      this.mutateHunks(session.id, (state) =>
        applyHunkDecision(state, input.command.type === "accept_hunk" ? input.command.hunkId : input.command.hunkId, input.command.type === "accept_hunk" ? "accepted" : "rejected"),
      );
      if (input.command.type === "accept_hunk") this.applyAcceptedHunks(session.id, ws.worktree);
      return;
    }
    if (input.command.type === "accept_file" || input.command.type === "reject_file") {
      this.mutateHunks(session.id, (state) =>
        applyFileDecision(state, input.command.filePath, input.command.type === "accept_file" ? "accepted" : "rejected"),
      );
      if (input.command.type === "accept_file") this.applyAcceptedHunks(session.id, ws.worktree);
      return;
    }
    if (input.command.type === "sync_base") {
      this.append(session.id, {
        type: "conflict",
        id: randomUUID(),
        at: new Date().toISOString(),
        files: [],
        message: "Base branch fetched. No conflicts on the fixture workspace.",
      });
      return;
    }
    if (input.command.type === "fix_error") {
      await this.runPrompt(input.user, session, ws, {
        type: "prompt",
        text: `Fix this preview error: ${input.command.eventId}`,
        attachments: [],
        mentions: [],
      });
      return;
    }
    if (input.command.type === "restore_checkpoint") {
      this.append(session.id, {
        type: "checkpoint",
        id: randomUUID(),
        at: new Date().toISOString(),
        gitSha: "restored",
        label: `Restored ${input.command.checkpointId}`,
      });
      return;
    }
    if (input.command.type === "decide_plan") {
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id);
        if (!s) return;
        s.events = s.events.map((e) => (e.type === "plan" ? { ...e, outcome: input.command.outcome } : e));
      });
      return;
    }
    if (input.command.type === "decide_permission") {
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id);
        if (!s) return;
        s.events = s.events.map((e) => (e.type === "permission" ? { ...e, outcome: input.command.outcome } : e));
      });
      return;
    }
    if (input.command.type === "answer_question") {
      this.store.update((d) => {
        const s = d.sessions.find((x) => x.id === session.id);
        if (!s) return;
        s.events = s.events.map((e) => (e.type === "question" ? { ...e, outcome: "answered" } : e));
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
    const userText = recipe ? recipe.template.replaceAll("{{model}}", command.text) : command.text;

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

    const rules = compileRules(platformRules(), user.locale);
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
    const provider = createProvider((session.provider as ProviderId) || "mock");
    const run = await provider.start({
      cwd: ws.worktree,
      onEvent: (event) => {
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
          void run.cancel();
          return;
        }
        this.append(session.id, event);
      },
    });
    this.runs.set(session.id, run);
    try {
      await run.prompt([{ type: "text", text: packed.text }]);
    } finally {
      run.stop();
      this.runs.delete(session.id);
      this.store.update((d) => {
        delete d.runLock[ws.id];
      });
    }
  }

  createInvite(user: UserRecord): { token: string; url: string } {
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

  mentionIndex() {
    return {
      routes: ["quotes", "customers", "deliveries", "login"],
      models: ["Quote", "Customer", "Delivery"],
      pages: ["Quotes/Index", "Customers/Index", "Auth/Login"],
    };
  }

  envPreview(workspaceId: string) {
    const spec = defaultWorkspaceSpec();
    const ws = this.requireWorkspace(workspaceId);
    const env = { ...PREVIEW_SIDE_EFFECTS, ...isolationEnv(workspaceId, `http://127.0.0.1:${ws.port ?? 0}`) };
    return { env, validation: validateEnvContract(spec, env), spec };
  }

  evaluateShell(command: string, worktree: string) {
    return evaluatePermission({ kind: "shell", command, worktree });
  }

  requireWorkspace(id: string): WorkspaceRecord {
    const ws = this.store.read().workspaces.find((w) => w.id === id);
    if (!ws) throw new Error("Workspace not found");
    return ws;
  }

  private materializeRules(worktree: string, locale: "en" | "pt-BR") {
    const compiled = compileRules(platformRules(), locale);
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

function platformRules() {
  return [
    {
      id: "platform",
      level: "platform" as const,
      title: "Platform",
      body: "Never run migrate:fresh, db:wipe, or write to ERP connections. Do not read .env files.",
    },
    {
      id: "project",
      level: "project" as const,
      title: "Concreserv",
      body: "Follow Inertia + Vue page conventions. Keep Laravel Boost MCP available. Workaround comments are normative.",
    },
    {
      id: "user",
      level: "user" as const,
      title: "User",
      body: "Prefer small, reviewable diffs and explain each file change.",
    },
  ];
}

let singleton: Platform | null = null;
export function getPlatform(): Platform {
  if (!singleton) singleton = new Platform();
  return singleton;
}

export const viewports: Record<Viewport, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1280, height: 800 },
};
