import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { foldEvents } from "@atelier/domain";
import { formatAgentError } from "./acp/errors.js";
import { Platform } from "./platform.js";
import { JsonStore, type UserRecord } from "./store.js";
import { listBranchMigrations } from "./migrations.js";
import { userEnvPath, writeUserEnv } from "./runtime/env-file.js";
import { writePreviewLogs } from "./runtime/preview-logs.js";

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
  it("lets local login succeed when GitHub App credentials are missing", async () => {
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

