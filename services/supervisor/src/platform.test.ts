import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { foldEvents } from "@atelier/domain";
import { Platform } from "./platform.js";
import { JsonStore } from "./store.js";
import { listBranchMigrations } from "./migrations.js";

const dirs: string[] = [];

function platform(): Platform {
  const dir = mkdtempSync(join(tmpdir(), "atelier-"));
  dirs.push(dir);
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
    const session = p.createSession(ws.id);
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
});
