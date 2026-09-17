import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderId, SessionEvent } from "@atelier/contracts";
import { emptyCursorCliAccount, foldEvents, shouldAutoResumePreview } from "@atelier/domain";
import { formatAgentError } from "./acp/errors.js";
import { bus } from "./bus.js";
import { Platform } from "./platform.js";
import type { AgentProvider } from "./providers/types.js";
import { JsonStore, type UserRecord } from "./store.js";
import { listBranchMigrations } from "./migrations.js";
import { userEnvPath, writeUserEnv } from "./runtime/env-file.js";
import { git } from "./runtime/git-ops.js";
import { writePreviewLogs } from "./runtime/preview-logs.js";

const dirs: string[] = [];

function platform(providerFactory?: (id: ProviderId) => AgentProvider): Platform {
  const dir = mkdtempSync(join(tmpdir(), "atelier-"));
  dirs.push(dir);
  process.env.ATELIER_WORKTREE_ROOT = join(dir, "workspaces");
  return new Platform(new JsonStore(join(dir, "platform.json")), providerFactory);
}

async function settleSession(p: Platform, sessionId: string) {
  const session = p.store.read().sessions.find((row) => row.id === sessionId);
  if (session) await p.flushWorkspace(session.workspaceId);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("platform", () => {
  it("lets GitHub login persist when clone credentials are missing", async () => {
    const previousVitest = process.env.VITEST;
    const previousAppId = process.env.GITHUB_APP_ID;
    const previousKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const previousInstallation = process.env.GITHUB_INSTALLATION_ID;
    delete process.env.VITEST;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_INSTALLATION_ID;
    try {
      const p = platform();
      const user = await p.loginDev("local-only");
      expect(user.login).toBe("local-only");
      expect(p.store.read().workspaces.some((row) => row.userId === user.id)).toBe(false);
      await expect(p.ensureWorkspace(user)).rejects.toThrow(/GitHub App credentials/);
    } finally {
      if (previousVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = previousVitest;
      if (previousAppId === undefined) delete process.env.GITHUB_APP_ID;
      else process.env.GITHUB_APP_ID = previousAppId;
      if (previousKey === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
      else process.env.GITHUB_APP_PRIVATE_KEY = previousKey;
      if (previousInstallation === undefined) delete process.env.GITHUB_INSTALLATION_ID;
      else process.env.GITHUB_INSTALLATION_ID = previousInstallation;
    }
  });

  it("maps github permissions and warms a workspace on login", async () => {
    const p = platform();
    expect(p.authorizeGitHub({ push: true })).toBe("editor");
    const user = await p.loginDev("ana", "pt-BR");
    expect(user.login).toBe("ana");
    const ws = await p.warmForUser(user);
    expect(ws.status).toBe("ready");
    expect(ws.branch).toBe("user/ana/studio");
  });

  it("plays a mock prompt and applies accepted hunks", async () => {
    const p = platform();
    const user = await p.loginDev("bruno");
    const ws = await p.ensureWorkspace(user);
    const session = p.createSession(ws.id, "mock");
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "prompt", text: "Create an Inertia quotes page", attachments: [], mentions: ["quotes"] },
    });
    await settleSession(p, session.id);
    const state = p.snapshot(session.id);
    expect(state.messages.some((m) => m.role === "user")).toBe(true);
    expect(state.hunks.length).toBeGreaterThan(0);
    const hunk = state.hunks[0]!;
    await p.handleCommand({ user, sessionId: session.id, command: { type: "accept_hunk", hunkId: hunk.id } });
    expect(p.snapshot(session.id).hunks[0]?.status).toBe("accepted");
    expect(readFileSync(join(ws.worktree, hunk.filePath), "utf8")).toContain("<script setup");
  });

  it("captures direct provider file edits as a diff and checkpoint", async () => {
    const prompts: string[] = [];
    const p = platform(() => ({
      capability: {
        id: "mock",
        label: "Writing provider",
        command: "mock",
        args: [],
        modes: ["agent"],
        images: false,
        todos: false,
        plans: false,
        questions: false,
      },
      start: async ({ cwd }) => ({
        prompt: async (blocks) => {
          prompts.push(blocks[0]?.text ?? "");
          mkdirSync(join(cwd, "app"), { recursive: true });
          writeFileSync(join(cwd, "app", "PromptCreated.php"), "<?php\n\nreturn 'created';\n");
        },
        cancel: async () => undefined,
        stop: () => undefined,
      }),
    }));
    const user = await p.loginDev("direct-writer");
    const ws = await p.ensureWorkspace(user);
    const session = p.createSession(ws.id, "mock");

    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "prompt", text: "Create app/PromptCreated.php", attachments: [], mentions: [] },
    });
    await settleSession(p, session.id);

    expect(readFileSync(join(ws.worktree, "app", "PromptCreated.php"), "utf8")).toContain("return 'created'");
    expect(p.snapshot(session.id).hunks.length).toBeGreaterThan(0);
    expect(p.snapshot(session.id).hunks.every((hunk) => hunk.filePath === "app/PromptCreated.php")).toBe(true);
    expect(p.snapshot(session.id).proposal?.files).toEqual(["app/PromptCreated.php"]);
    const stored = p.store.read().sessions.find((row) => row.id === session.id);
    expect(stored?.events.some((event) => event.type === "proposal")).toBe(true);
    expect(stored?.events.some((event) => event.type === "prompt_manifest")).toBe(true);
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "accept_file", filePath: "app/PromptCreated.php" },
    });
    const after = p.store.read().sessions.find((row) => row.id === session.id);
    const checkpoint = after?.events.find((event) => event.type === "checkpoint");
    expect(checkpoint && checkpoint.type === "checkpoint" ? checkpoint.gitSha : "").toMatch(/^[0-9a-f]{7,}$/);
    expect(await git(ws.worktree, ["status", "--porcelain", "--", "app/PromptCreated.php"])).toBe("");
    expect(prompts[0]).toContain("Create app/PromptCreated.php");
    expect(prompts[0]).toContain("Inspect relevant files before editing");
  });

  it("discards a proposal without committing leftover dirty files", async () => {
    const p = platform(() => ({
      capability: {
        id: "mock",
        label: "Writing provider",
        command: "mock",
        args: [],
        modes: ["agent"],
        images: false,
        todos: false,
        plans: false,
        questions: false,
      },
      start: async ({ cwd }) => ({
        prompt: async () => {
          mkdirSync(join(cwd, "app"), { recursive: true });
          writeFileSync(join(cwd, "app", "PromptCreated.php"), "<?php\n\nreturn 'created';\n");
        },
        cancel: async () => undefined,
        stop: () => undefined,
      }),
    }));
    const user = await p.loginDev("discard-writer");
    const ws = await p.ensureWorkspace(user);
    const session = p.createSession(ws.id, "mock");
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "prompt", text: "Create app/PromptCreated.php", attachments: [], mentions: [] },
    });
    await settleSession(p, session.id);
    expect(p.snapshot(session.id).proposal?.files).toContain("app/PromptCreated.php");
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "prompt", text: "another change", attachments: [], mentions: [] },
    });
    await settleSession(p, session.id);
    const blocked = p.store.read().sessions.find((row) => row.id === session.id)?.events ?? [];
    expect(blocked.some((event) => event.type === "run_failure" && event.message.includes("pending change proposal"))).toBe(true);
    await p.handleCommand({ user, sessionId: session.id, command: { type: "discard_proposal" } });
    expect(existsSync(join(ws.worktree, "app", "PromptCreated.php"))).toBe(false);
    expect(p.snapshot(session.id).run?.status).toBe("rejected");
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "prompt", text: "Create app/PromptCreated.php again", attachments: [], mentions: [] },
    });
    await settleSession(p, session.id);
    expect(existsSync(join(ws.worktree, "app", "PromptCreated.php"))).toBe(true);
  });

  it("blocks spectator prompts and supports session search", async () => {
    const p = platform();
    const user = await p.loginDev("carla");
    const ws = await p.ensureWorkspace(user);
    const session = p.createSession(ws.id, "mock");
    await expect(
      p.handleCommand({
        user,
        sessionId: session.id,
        spectator: true,
        command: { type: "prompt", text: "nope", attachments: [], mentions: [] },
      }),
    ).rejects.toThrow(/Spectators/);
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "prompt", text: "Find the quotes list", attachments: [], mentions: [] },
    });
    await settleSession(p, session.id);
    expect(p.sessions(ws.id, "quotes").length).toBeGreaterThan(0);
    expect(foldEvents(p.sessions(ws.id)[0]!.events).messages.length).toBeGreaterThan(0);
  });

  it("returns from handleCommand before the provider prompt finishes", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    const p = platform(() => ({
      capability: {
        id: "mock",
        label: "Slow",
        command: "mock",
        args: [],
        modes: ["agent"],
        images: false,
        todos: false,
        plans: false,
        questions: false,
      },
      start: async () => ({
        prompt: async () => {
          await blocked;
          finished = true;
        },
        cancel: async () => undefined,
        stop: () => undefined,
      }),
    }));
    const user = await p.loginDev("async-prompt");
    const ws = await p.ensureWorkspace(user);
    const session = p.createSession(ws.id, "mock");
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "prompt", text: "Stay open", attachments: [], mentions: [] },
    });
    expect(finished).toBe(false);
    release();
    await settleSession(p, session.id);
    expect(finished).toBe(true);
  });

  it("publishes permission decisions on the session bus", async () => {
    const p = platform();
    const user = await p.loginDev("perm-bus");
    const ws = await p.ensureWorkspace(user);
    const session = p.createSession(ws.id, "mock");
    p.append(session.id, {
      type: "permission",
      id: "perm-1",
      at: new Date().toISOString(),
      toolCallId: "c1",
      title: "laravel-boost-database-query: database-query",
      options: ["allow-once", "reject-once"],
      outcome: "pending",
    });
    const seen: SessionEvent[] = [];
    const unsub = bus.subscribe(session.id, (event) => {
      seen.push(event);
    });
    await p.handleCommand({
      user,
      sessionId: session.id,
      command: { type: "decide_permission", outcome: "allow-once" },
    });
    unsub();
    expect(seen.some((event) => event.type === "permission" && event.outcome === "allow-once")).toBe(true);
    const stored = p.store.read().sessions.find((row) => row.id === session.id)?.events ?? [];
    expect(stored.some((event) => event.type === "permission" && event.outcome === "allow-once")).toBe(true);
  });

  it("creates invite and share tokens", async () => {
    const p = platform();
    const user = await p.loginDev("diego");
    const invite = p.createInvite(user);
    expect(invite.token.length).toBeGreaterThan(8);
    const guest = await p.loginDev("eva");
    expect(p.acceptInvite(invite.token, guest).pending).toBe(false);
    const ws = await p.ensureWorkspace(user);
    const share = p.sharePreview(ws.id);
    expect(p.resolveShare(share.token)?.id).toBe(ws.id);
  });

  it("does not invent schema divergence without an applied snapshot", async () => {
    const p = platform();
    const user = await p.loginDev("fernanda");
    const ws = await p.ensureWorkspace(user);
    expect(p.workspaceDivergence(ws.id)).toEqual({ pendingInBranch: [], extraInDatabase: [] });
  });

  it("reports pending branch migrations once the studio has an applied snapshot", async () => {
    const p = platform();
    const user = await p.loginDev("gabriel");
    const ws = await p.ensureWorkspace(user);
    const dir = join(ws.worktree, "database", "migrations");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2024_01_01_create_users.php"), "<?php");
    writeFileSync(join(dir, "2026_04_01_add_quote_window.php"), "<?php");
    p.store.update((db) => {
      db.migrationLog.push({
        id: "m1",
        author: "studio",
        branch: ws.branch,
        name: "2024_01_01_create_users",
        at: new Date().toISOString(),
        output: "INFO  Running migrations.",
      });
    });
    expect(listBranchMigrations(ws.worktree).map((f) => f.name)).toEqual([
      "2024_01_01_create_users",
      "2026_04_01_add_quote_window",
    ]);
    expect(p.workspaceDivergence(ws.id)).toEqual({
      pendingInBranch: ["2026_04_01_add_quote_window"],
      extraInDatabase: [],
    });
  });

  it("reads mentions, quota, and env from the worktree", async () => {
    const p = platform();
    const user = await p.loginDev("helena");
    const ws = await p.ensureWorkspace(user);
    mkdirSync(join(ws.worktree, "app", "Models"), { recursive: true });
    writeFileSync(join(ws.worktree, "app", "Models", "UniqueWidget.php"), "<?php");
    const mentions = await p.mentionIndex(ws.id);
    expect(mentions.models).toContain("UniqueWidget");
    expect(mentions.routes).not.toEqual(["quotes", "customers", "deliveries", "login"]);
    const quota = await p.workspaceQuota(ws.id);
    expect(quota.usedMb).toBeGreaterThanOrEqual(0);
    expect(quota.limitMb).toBeGreaterThan(0);
    expect(quota.usedMb).not.toBe(386);
    const env = p.envPreview(ws.id);
    expect(env.env.APP_URL).toContain(ws.previewToken);
    expect(env.env.APP_URL).not.toMatch(/127\.0\.0\.1:\d+$/);
  });

  it("syncs the base branch without inventing a fixture message", async () => {
    const p = platform();
    const user = await p.loginDev("igor");
    const ws = await p.ensureWorkspace(user);
    const session = p.createSession(ws.id, "mock");
    await p.handleCommand({ user, sessionId: session.id, command: { type: "sync_base" } });
    const stored = p.store.read().sessions.find((s) => s.id === session.id);
    const conflict = stored?.events.find((e) => e.type === "conflict");
    expect(conflict && conflict.type === "conflict" ? conflict.message : "").not.toMatch(/fixture workspace/i);
  });

  it("persists hibernated status from running or ready without a live runtime handle", async () => {
    const p = platform();
    const user = await p.loginDev("joao");
    const ws = await p.ensureWorkspace(user);
    expect(ws.status).toBe("ready");
    const ready = await p.adminHibernate(ws.id);
    expect(ready.status).toBe("hibernated");
    expect(ready.port).toBeUndefined();
    expect(p.requireWorkspace(ws.id).desired).toBe("hibernated");

    p.store.update((db) => {
      const row = db.workspaces.find((item) => item.id === ws.id)!;
      row.status = "running";
      row.desired = "running";
      row.port = 45999;
      row.vitePort = 46000;
    });
    const running = await p.hibernate(ws.id);
    expect(running.status).toBe("hibernated");
    expect(running.port).toBeUndefined();
    expect(running.vitePort).toBeUndefined();
    await expect(p.adminHibernate(ws.id)).rejects.toThrow(/already hibernat/i);
    await expect(p.adminHibernate("missing-workspace")).rejects.toThrow(/not found/i);
  });

  it("pins user hibernate so reopening the workspace does not auto-resume", async () => {
    const p = platform();
    const user = await p.loginDev("katia");
    const ws = await p.ensureWorkspace(user);

    const idle = await p.hibernate(ws.id);
    expect(idle.hibernatedByUser).toBeFalsy();
    expect(shouldAutoResumePreview(idle)).toBe(true);

    const pinned = await p.hibernate(ws.id, { byUser: true });
    expect(pinned.status).toBe("hibernated");
    expect(pinned.hibernatedByUser).toBe(true);
    expect(shouldAutoResumePreview(pinned)).toBe(false);

    const stillPinned = await p.hibernate(ws.id);
    expect(stillPinned.hibernatedByUser).toBe(true);
    expect(shouldAutoResumePreview(stillPinned)).toBe(false);

    const warmedPinned = await p.warmForUser(user);
    expect(warmedPinned.status).toBe("hibernated");
    expect(warmedPinned.hibernatedByUser).toBe(true);
    expect(shouldAutoResumePreview(warmedPinned)).toBe(false);

    p.store.update((db) => {
      const row = db.workspaces.find((item) => item.id === ws.id)!;
      row.hibernatedByUser = false;
    });
    const idleAgain = p.requireWorkspace(ws.id);
    expect(shouldAutoResumePreview(idleAgain)).toBe(true);
    const warmed = await p.warmForUser(user);
    expect(warmed.status).toBe("ready");
    expect(shouldAutoResumePreview(warmed)).toBe(true);
  });

  it("does not mark a running workspace ready when warming for a user", async () => {
    const p = platform();
    const user = await p.loginDev("lara");
    const ws = await p.ensureWorkspace(user);
    p.store.update((db) => {
      const row = db.workspaces.find((item) => item.id === ws.id)!;
      row.status = "running";
      row.desired = "running";
    });
    const warmed = await p.warmForUser(user);
    expect(warmed.status).toBe("running");
  });

  it("surfaces JSON-RPC ACP failures instead of 'The Cursor agent failed.'", () => {
    const message = formatAgentError({
      code: -32603,
      message: "Internal error",
      data: [{ path: ["mcpServers", 0], message: "Invalid input" }],
    });
    expect(`The agent could not complete this prompt. ${message}`).toContain("mcpServers");
    expect(message).not.toBe("The Cursor agent failed.");
  });

  it("prefills global env from the worktree when global.env is empty", async () => {
    const p = platform();
    const user = await p.loginDev("julia");
    await p.ensureWorkspace(user);
    expect(existsSync(join(p.envRoot(), "global.env"))).toBe(false);
    const preview = p.getGlobalEnv();
    expect(preview.env.APP_NAME).toBe("AtelierFixture");
    expect(preview.env.DB_CONNECTION).toBe("mariadb");
    expect(preview.env.APP_URL).toBeUndefined();
    expect(preview.env.SESSION_COOKIE).toBeUndefined();
    expect(preview.env.PORT).toBeUndefined();
    expect(preview.env.APP_KEY).toBe("••••");
    expect(preview.secrets.APP_KEY).toBe("base64:fixture-key");
    expect(p.revealGlobalEnvKey("APP_KEY")).toBe("base64:fixture-key");
    expect(existsSync(join(p.envRoot(), "global.env"))).toBe(false);
    p.saveGlobalEnv({ env: preview.env });
    expect(existsSync(join(p.envRoot(), "global.env"))).toBe(true);
    expect(p.revealGlobalEnvKey("APP_KEY")).toBe("base64:fixture-key");
    expect(p.getGlobalEnv().env.APP_NAME).toBe("AtelierFixture");
  });

  it("treats regular users as not admin, including GitHub owners who are not ticoncreserv", () => {
    const p = platform();
    const ana = addUser(p, "ana", "owner");
    const bob = addUser(p, "bob", "editor");
    expect(p.isPlatformAdmin(ana)).toBe(false);
    expect(p.isPlatformAdmin(bob)).toBe(false);
    expect(p.listUsers().find((row) => row.id === ana.id)).toMatchObject({
      platformAdmin: false,
      repoOwner: false,
    });
  });

  it("grants and revokes platformAdmin for other users via setPlatformAdmin", () => {
    const p = platform();
    const seed = addUser(p, "ticoncreserv", "viewer");
    const bob = addUser(p, "bob", "owner");
    expect(p.isPlatformAdmin(bob)).toBe(false);

    const granted = p.setPlatformAdmin(seed, bob.id, true);
    expect(granted?.platformAdmin).toBe(true);
    expect(p.isPlatformAdmin(bob)).toBe(true);
    expect(p.store.read().users.find((row) => row.id === bob.id)?.platformAdmin).toBe(true);

    const revoked = p.setPlatformAdmin(seed, bob.id, false);
    expect(revoked?.platformAdmin).toBe(false);
    expect(p.isPlatformAdmin(bob)).toBe(false);
    expect(p.store.read().users.find((row) => row.id === bob.id)?.platformAdmin).toBe(false);
  });

  it("cannot remove the last platform admin, including env-listed logins", () => {
    const p = platform();
    const ana = addUser(p, "ana", "editor");
    p.store.update((db) => {
      const row = db.users.find((user) => user.id === ana.id);
      if (row) row.platformAdmin = true;
    });
    expect(() => p.setPlatformAdmin(ana, ana.id, false)).toThrow(/last platform admin/i);
    expect(p.isPlatformAdmin(ana)).toBe(true);

    const bob = addUser(p, "bob", "editor");
    p.setPlatformAdmin(ana, bob.id, true);
    p.setPlatformAdmin(ana, ana.id, false);
    expect(p.isPlatformAdmin(ana)).toBe(false);
    expect(p.isPlatformAdmin(bob)).toBe(true);
    expect(() => p.setPlatformAdmin(bob, bob.id, false)).toThrow(/last platform admin/i);

    const previous = process.env.ATELIER_ADMIN_LOGINS;
    process.env.ATELIER_ADMIN_LOGINS = "carol";
    try {
      const q = platform();
      const carol = addUser(q, "carol", "viewer");
      const dave = addUser(q, "dave", "owner");
      expect(q.isPlatformAdmin(carol)).toBe(true);
      expect(q.isPlatformAdmin(dave)).toBe(false);
      expect(() => q.setPlatformAdmin(carol, carol.id, false)).toThrow(/env-listed admin|last platform admin/i);
      q.setPlatformAdmin(carol, dave.id, true);
      q.setPlatformAdmin(carol, dave.id, false);
      expect(q.isPlatformAdmin(dave)).toBe(false);
      expect(q.isPlatformAdmin(carol)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.ATELIER_ADMIN_LOGINS;
      else process.env.ATELIER_ADMIN_LOGINS = previous;
    }
  });

  it("treats ticoncreserv as a permanent admin and rejects revoke", () => {
    const p = platform();
    const owner = addUser(p, "ticoncreserv", "viewer");
    const bob = addUser(p, "bob", "owner");
    p.store.update((db) => {
      const row = db.users.find((user) => user.id === owner.id);
      if (row) row.platformAdmin = false;
    });
    expect(p.isPlatformAdmin(owner)).toBe(true);
    expect(p.listUsers().find((row) => row.id === owner.id)).toMatchObject({
      platformAdmin: true,
      repoOwner: true,
    });
    expect(p.isPlatformAdmin(bob)).toBe(false);

    p.setPlatformAdmin(owner, bob.id, true);
    expect(() => p.setPlatformAdmin(bob, owner.id, false)).toThrow(/permanent platform admin|repository owner/i);
    expect(p.isPlatformAdmin(owner)).toBe(true);
    expect(p.store.read().users.find((row) => row.id === owner.id)?.platformAdmin).toBe(false);

    p.setPlatformAdmin(owner, bob.id, false);
    expect(p.isPlatformAdmin(bob)).toBe(false);
    expect(p.isPlatformAdmin(owner)).toBe(true);
  });

  it("destroys the local clone, keeps overlay and sessions, and reclones on next active login", async () => {
    const p = platform();
    const user = await p.loginDev("kaio");
    const ws = await p.ensureWorkspace(user);
    const firstId = ws.id;
    writeUserEnv(user.id, { EXTRA: "keep" }, p.envRoot());
    const overlay = userEnvPath(user.id, p.envRoot());
    expect(existsSync(overlay)).toBe(true);
    p.createSession(ws.id, "mock");
    const sessionCount = p.store.read().sessions.filter((row) => row.workspaceId === ws.id).length;
    expect(sessionCount).toBeGreaterThan(0);

    const listed = p.listAdminWorkspaces().find((row) => row.id === ws.id);
    expect(listed).toMatchObject({ login: "kaio", worktree: ws.worktree, previewPath: null });
    expect(listed?.bytes).toBeGreaterThan(0);
    expect(listed?.lastActiveAt).toBeTruthy();

    const destroyed = await p.adminDestroy(ws.id);
    expect(destroyed.status).toBe("destroyed");
    expect(existsSync(ws.worktree)).toBe(false);
    expect(existsSync(overlay)).toBe(true);
    expect(p.store.read().sessions.filter((row) => row.workspaceId === ws.id)).toHaveLength(sessionCount);
    expect(p.listAdminWorkspaces().find((row) => row.id === ws.id)).toBeUndefined();
    await expect(p.adminDestroy(ws.id)).rejects.toThrow(/not found/i);

    const again = await p.loginDev("kaio");
    const live = p.store.read().workspaces.find((row) => row.userId === again.id && row.status !== "destroyed");
    expect(live?.id).not.toBe(firstId);
    expect(live?.status).toBe("ready");
    expect(existsSync(live!.worktree)).toBe(true);
  });

  it("skips warming a disabled user and refuses to disable the permanent admin", async () => {
    const p = platform();
    const owner = addUser(p, "ticoncreserv");
    const bob = await p.loginDev("bob-disabled");
    const ws = await p.ensureWorkspace(bob);
    await p.setUserDisabled(owner, bob.id, true);
    expect(p.store.read().users.find((row) => row.id === bob.id)?.disabled).toBe(true);
    expect(p.listUsers().find((row) => row.id === bob.id)).toMatchObject({ disabled: true, canDisable: true });

    await p.loginDev("bob-disabled");
    const live = p.store.read().workspaces.filter((row) => row.userId === bob.id && row.status !== "destroyed");
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(ws.id);

    await expect(p.setUserDisabled(owner, owner.id, true)).rejects.toThrow(/permanent platform admin/i);
    const ownerWs = await p.ensureWorkspace(owner);
    await expect(p.adminDestroy(ownerWs.id, { deactivateUser: true })).rejects.toThrow(/permanent platform admin/i);
    expect(p.store.read().users.find((row) => row.id === owner.id)?.disabled).toBeFalsy();

    const carol = await p.loginDev("carol-gone");
    const cws = await p.ensureWorkspace(carol);
    await p.setUserDisabled(owner, carol.id, true, { destroyWorkspace: true });
    expect(p.store.read().users.find((row) => row.id === carol.id)?.disabled).toBe(true);
    expect(p.store.read().workspaces.find((row) => row.id === cws.id)?.status).toBe("destroyed");
    expect(existsSync(cws.worktree)).toBe(false);
  });

  it("lists workspace errors with log-backed hints and clears them", async () => {
    const p = platform();
    const owner = addUser(p, "ticoncreserv");
    const user = await p.loginDev("erro-user");
    const ws = await p.ensureWorkspace(user);
    p.store.update((db) => {
      const row = db.workspaces.find((item) => item.id === ws.id)!;
      row.status = "error";
      row.lastError = "Vite did not start in dev mode for workspace x";
      row.errorAt = new Date().toISOString();
    });
    writePreviewLogs(ws.id, { artisan: "boot ok", vite: "ENOSPC watch", error: "Vite did not start" }, p.envRoot());
    const listed = p.listAdminErrors();
    expect(listed.some((row) => row.id === ws.id)).toBe(true);
    const entry = listed.find((row) => row.id === ws.id)!;
    expect(entry.hints.some((hint) => hint.id === "vite" || hint.id === "enospc")).toBe(true);
    const logs = p.getWorkspaceLogs(ws.id);
    expect(logs.vite).toContain("ENOSPC");
    p.clearWorkspaceError(ws.id);
    expect(p.listAdminErrors().find((row) => row.id === ws.id)).toBeUndefined();
    expect(p.requireWorkspace(ws.id).status).toBe("hibernated");
    expect(p.isPlatformAdmin(owner)).toBe(true);
  });

  it("discovers repository skills and merges MCP without clobbering repo servers", async () => {
    const p = platform();
    const user = await p.loginDev("gina");
    const ws = await p.ensureWorkspace(user);
    mkdirSync(join(ws.worktree, ".agents", "skills", "land-it"), { recursive: true });
    writeFileSync(
      join(ws.worktree, ".agents", "skills", "land-it", "SKILL.md"),
      "---\nname: land-it\ndescription: Lands a pull request.\n---\n\nLand it.\n",
    );
    const skills = p.skillCatalog(ws.id, p.store.read().users.find((row) => row.id === user.id)!);
    expect(skills.skills.some((row) => row.name === "land-it" && row.source === "repo")).toBe(true);
    expect(skills.skills.some((row) => row.name === "inertia-crud")).toBe(true);
    p.saveUserSkill(user, { name: "my-review", description: "Reviews the diff.", body: "Review it.", manualOnly: true });
    expect(existsSync(join(ws.worktree, ".cursor", "skills", "my-review", "SKILL.md"))).toBe(true);
    p.setSkillEnabled(user, ws.id, "my-review", false);
    expect(existsSync(join(ws.worktree, ".cursor", "skills", "my-review", "SKILL.md"))).toBe(false);
    const mcpFile = join(ws.worktree, ".cursor", "mcp.json");
    expect(JSON.parse(readFileSync(mcpFile, "utf8")).mcpServers["laravel-boost"]).toBeTruthy();
    expect(() => p.saveUserMcp(user, { mcpServers: { evil: { command: "rm" } } })).toThrow(/not allowed/);
    p.saveUserMcp(user, { mcpServers: { notes: { url: "https://notes.example/mcp" } } });
    expect(p.mcpCatalog(ws.id, user).servers.some((row) => row.name === "notes" && row.source === "user")).toBe(true);
  });

  it("lists extra providers only after flags, enablement, and credentials line up", () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousCanary = process.env.ATELIER_PROVIDER_CANARY;
    const previousPath = process.env.PATH;
    process.env.ANTHROPIC_API_KEY = "sk-test";
    delete process.env.ATELIER_PROVIDER_CANARY;
    try {
      const p = platform();
      const bin = join(dirs[dirs.length - 1]!, "bin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, "npx"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      process.env.PATH = `${bin}:${previousPath ?? "/usr/bin"}`;
      expect(p.listProviders().map((row) => row.id).sort()).toEqual(["cursor", "mock"]);
      p.saveFlags({ multiProvider: true, claudeProvider: true });
      expect(p.listProviders().some((row) => row.id === "claude")).toBe(false);
      p.saveProviderSettings({ id: "claude", enabled: true });
      expect(p.listProviders().some((row) => row.id === "claude")).toBe(true);
      expect(p.getProviderSettings().find((row) => row.id === "claude")).toMatchObject({
        implemented: true,
        hasKey: true,
        health: "available",
      });
      p.saveFlags({ providerCanary: true });
      expect(p.listProviders().some((row) => row.id === "claude")).toBe(false);
      process.env.ATELIER_PROVIDER_CANARY = "1";
      expect(p.listProviders().some((row) => row.id === "claude")).toBe(true);
      p.saveProviderSettings({ id: "gemini", apiKey: "g-test" });
      expect(p.getProviderSettings().find((row) => row.id === "gemini")?.hasKey).toBe(true);
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      if (previousCanary === undefined) delete process.env.ATELIER_PROVIDER_CANARY;
      else process.env.ATELIER_PROVIDER_CANARY = previousCanary;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it("stores several keys and an admin default model per provider", () => {
    const previous = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    try {
      const p = platform();
      p.saveProviderSettings({ id: "cursor", apiKey: "one", label: "primary" });
      p.saveProviderSettings({ id: "cursor", apiKey: "two", label: "backup" });
      p.saveProviderSettings({ id: "cursor", model: "gpt-5" });
      const row = p.getProviderSettings().find((item) => item.id === "cursor");
      expect(row?.model).toBe("gpt-5");
      expect(row?.keys.map((key) => key.label)).toEqual(["primary", "backup"]);
      expect(row?.keys.every((key) => key.present)).toBe(true);
      expect(p.listProviders().find((item) => item.id === "cursor")?.model).toBe("gpt-5");
      p.saveProviderSettings({ id: "cursor", keyRef: row!.keys[0]!.ref, moveKey: "down" });
      expect(p.getProviderSettings().find((item) => item.id === "cursor")?.keys.map((key) => key.label)).toEqual([
        "backup",
        "primary",
      ]);
      p.saveProviderSettings({ id: "cursor", keyRef: row!.keys[1]!.ref, deleteKey: true });
      expect(p.getProviderSettings().find((item) => item.id === "cursor")?.keys).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = previous;
    }
  });

  it("fails over to the next key when the first one is rejected", async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousPath = process.env.PATH;
    delete process.env.ANTHROPIC_API_KEY;
    const started: string[] = [];
    const factory = (id: ProviderId): AgentProvider => ({
      capability: { id, label: id, command: "mock", args: [], modes: ["agent", "plan", "ask"], images: true, todos: true, plans: true, questions: true },
      async start(input) {
        started.push(input.apiKey ?? "");
        if (input.apiKey === "bad-key") throw new Error("401 Unauthorized");
        return {
          models: [{ id: "opus", label: "Opus" }],
          prompt: async () => {
            input.onEvent({
              type: "assistant_message",
              id: "a1",
              at: new Date().toISOString(),
              text: `used ${input.apiKey}`,
              streaming: false,
            });
          },
          cancel: async () => undefined,
          stop: () => undefined,
        };
      },
    });
    try {
      const p = platform(factory);
      const bin = join(dirs[dirs.length - 1]!, "bin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, "npx"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      process.env.PATH = `${bin}:${previousPath ?? "/usr/bin"}`;
      p.saveFlags({ multiProvider: true, claudeProvider: true });
      p.saveProviderSettings({ id: "claude", enabled: true, apiKey: "bad-key", label: "primary" });
      p.saveProviderSettings({ id: "claude", apiKey: "good-key", label: "backup" });
      p.saveProviderSettings({ id: "claude", model: "opus" });
      const user = addUser(p, "keys");
      const ws = await p.ensureWorkspace(user);
      const session = p.createSession(ws.id, "claude");
      await p.handleCommand({
        user,
        sessionId: session.id,
        command: { type: "prompt", text: "Hello", attachments: [], mentions: [] },
      });
      await settleSession(p, session.id);
      expect(started).toEqual(["bad-key", "good-key"]);
      const events = p.store.read().sessions.find((row) => row.id === session.id)?.events ?? [];
      expect(events.some((event) => event.type === "assistant_message" && event.text.includes("good-key"))).toBe(true);
      const settings = p.getProviderSettings().find((row) => row.id === "claude");
      expect(settings?.keys[0]?.failures).toBeGreaterThan(0);
      expect(settings?.keys[1]?.failures).toBe(0);
      expect(settings?.models.some((item) => item.id === "opus")).toBe(true);
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it("fails over from a Cursor CLI account to the next account then an API key", async () => {
    const previousKey = process.env.CURSOR_API_KEY;
    const previousHome = process.env.ATELIER_CURSOR_HOME;
    const started: string[] = [];
    const factory = (id: ProviderId): AgentProvider => ({
      capability: { id, label: id, command: "mock", args: [], modes: ["agent", "plan", "ask"], images: true, todos: true, plans: true, questions: true },
      async start(input) {
        const slot = input.home?.split("/").pop() ?? input.apiKey ?? "";
        started.push(slot);
        if (slot === "default") throw new Error("not logged in");
        if (slot === "account-2") throw new Error("You've hit your usage limit");
        return {
          prompt: async () => {
            input.onEvent({
              type: "assistant_message",
              id: "a1",
              at: new Date().toISOString(),
              text: `used ${slot}`,
              streaming: false,
            });
          },
          cancel: async () => undefined,
          stop: () => undefined,
        };
      },
    });
    try {
      delete process.env.CURSOR_API_KEY;
      const p = platform(factory);
      process.env.ATELIER_CURSOR_HOME = join(dirs[dirs.length - 1]!, "cursor-home");
      p.store.update((db) => {
        db.providers.cursor = {
          enabled: true,
          cliAccounts: [
            { ...emptyCursorCliAccount("default"), loggedIn: true, account: "one@example.com" },
            { ...emptyCursorCliAccount("account-2"), loggedIn: true, account: "two@example.com" },
          ],
        };
      });
      p.saveProviderSettings({ id: "cursor", apiKey: "crsr-fallback", label: "fallback" });
      const user = addUser(p, "cursor-cli");
      const ws = await p.ensureWorkspace(user);
      const session = p.createSession(ws.id, "cursor");
      await p.handleCommand({
        user,
        sessionId: session.id,
        command: { type: "prompt", text: "Hello", attachments: [], mentions: [] },
      });
      await settleSession(p, session.id);
      expect(started).toEqual(["default", "account-2", "crsr-fallback"]);
      const events = p.store.read().sessions.find((row) => row.id === session.id)?.events ?? [];
      expect(events.some((event) => event.type === "assistant_message" && event.text.includes("crsr-fallback"))).toBe(true);
      expect(events.some((event) => event.type === "run_failure" && event.kind === "provider_failover")).toBe(true);
      const settings = p.getProviderSettings().find((row) => row.id === "cursor");
      expect(settings?.cliAccounts?.find((row) => row.id === "default")?.loggedIn).toBe(false);
      expect(settings?.cliAccounts?.find((row) => row.id === "account-2")?.lastFailureKind).toBe("quota");
      expect(settings?.keys[0]?.failures).toBe(0);
    } finally {
      if (previousKey === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = previousKey;
      if (previousHome === undefined) delete process.env.ATELIER_CURSOR_HOME;
      else process.env.ATELIER_CURSOR_HOME = previousHome;
    }
  });
});

function addUser(p: Platform, login: string, role: UserRecord["role"] = "owner"): UserRecord {
  const user: UserRecord = {
    id: login,
    login,
    name: login,
    email: `${login}@users.noreply.github.com`,
    locale: "en",
    role,
  };
  p.store.update((db) => {
    db.users.push(user);
  });
  return p.store.read().users.find((row) => row.id === login)!;
}

