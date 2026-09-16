import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { foldEvents } from "@atelier/domain";
import { formatAgentError } from "./acp/errors.js";
import { Platform } from "./platform.js";
import { JsonStore, type UserRecord } from "./store.js";
import { listBranchMigrations } from "./migrations.js";

const dirs: string[] = [];

function platform(): Platform {
  const dir = mkdtempSync(join(tmpdir(), "atelier-"));
  dirs.push(dir);
  process.env.ATELIER_WORKTREE_ROOT = join(dir, "workspaces");
  return new Platform(new JsonStore(join(dir, "platform.json")));
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("platform", () => {
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
    const state = p.snapshot(session.id);
    expect(state.messages.some((m) => m.role === "user")).toBe(true);
    expect(state.hunks.length).toBeGreaterThan(0);
    const hunk = state.hunks[0]!;
    await p.handleCommand({ user, sessionId: session.id, command: { type: "accept_hunk", hunkId: hunk.id } });
    expect(p.snapshot(session.id).hunks[0]?.status).toBe("accepted");
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
    expect(p.sessions(ws.id, "quotes").length).toBeGreaterThan(0);
    expect(foldEvents(p.sessions(ws.id)[0]!.events).messages.length).toBeGreaterThan(0);
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
    expect(p.revealGlobalEnvKey("APP_KEY")).toBe("base64:fixture-key");
    expect(existsSync(join(p.envRoot(), "global.env"))).toBe(false);
    p.saveGlobalEnv({ env: preview.env });
    expect(existsSync(join(p.envRoot(), "global.env"))).toBe(true);
    expect(p.revealGlobalEnvKey("APP_KEY")).toBe("base64:fixture-key");
    expect(p.getGlobalEnv().env.APP_NAME).toBe("AtelierFixture");
  });

  it("revoking during bootstrap ends owner auto-admin and keeps the other admin", () => {
    const p = platform();
    const ana = addUser(p, "ana");
    const bob = addUser(p, "bob");
    expect(p.hasExplicitAdmin()).toBe(false);
    expect(p.isPlatformAdmin(ana)).toBe(true);
    expect(p.isPlatformAdmin(bob)).toBe(true);

    const updated = p.setPlatformAdmin(ana, bob.id, false);
    expect(updated?.platformAdmin).toBe(false);
    expect(p.hasExplicitAdmin()).toBe(true);
    expect(p.isPlatformAdmin(bob)).toBe(false);
    expect(p.isPlatformAdmin(ana)).toBe(true);
    expect(p.listUsers().find((row) => row.id === bob.id)?.platformAdmin).toBe(false);
    expect(p.listUsers().find((row) => row.id === ana.id)?.platformAdmin).toBe(true);

    const cara = addUser(p, "cara");
    expect(p.isPlatformAdmin(cara)).toBe(false);
  });

  it("cannot remove the last platform admin, including env-listed logins", () => {
    const p = platform();
    const ana = addUser(p, "ana");
    expect(() => p.setPlatformAdmin(ana, ana.id, false)).toThrow(/last platform admin/i);
    expect(p.isPlatformAdmin(ana)).toBe(true);
    expect(p.hasExplicitAdmin()).toBe(false);

    const bob = addUser(p, "bob");
    p.setPlatformAdmin(ana, bob.id, false);
    expect(() => p.setPlatformAdmin(ana, ana.id, false)).toThrow(/last platform admin/i);
    expect(p.isPlatformAdmin(ana)).toBe(true);
    expect(p.isPlatformAdmin(bob)).toBe(false);

    const previous = process.env.ATELIER_ADMIN_LOGINS;
    process.env.ATELIER_ADMIN_LOGINS = "carol";
    try {
      const q = platform();
      const carol = addUser(q, "carol", "viewer");
      const dave = addUser(q, "dave");
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

