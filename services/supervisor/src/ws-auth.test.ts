import { describe, expect, it } from "vitest";
import { signSession } from "./session-cookie.js";
import { JsonStore } from "./store.js";
import { authorizeSessionSocket } from "./ws-auth.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("websocket session auth", () => {
  it("rejects anonymous sockets and allows the workspace owner", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-ws-"));
    const store = new JsonStore(join(dir, "platform.json"));
    store.update((db) => {
      db.users.push({
        id: "u1",
        login: "ana",
        name: "Ana",
        email: "ana@example.com",
        locale: "en",
        role: "owner",
      });
      db.workspaces.push({
        id: "w1",
        projectId: "concreserv",
        userId: "u1",
        branch: "user/ana/studio",
        status: "ready",
        desired: "ready",
        previewToken: "tok",
        worktree: dir,
        lastActiveAt: new Date().toISOString(),
      });
      db.sessions.push({
        id: "s1",
        workspaceId: "w1",
        title: "Session",
        events: [],
        provider: "mock",
        createdAt: new Date().toISOString(),
      });
      db.members.push({ userId: "u1", projectId: "concreserv", role: "owner" });
    });
    const platform = {
      store,
      canAccessWorkspace: (user: { id: string }, workspace: { userId: string }) => user.id === workspace.userId,
    };
    expect(
      authorizeSessionSocket({ cookieHeader: "", sessionId: "s1", platform }),
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      authorizeSessionSocket({
        cookieHeader: `atelier_session=${signSession("u1")}`,
        sessionId: "missing",
        platform,
      }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      authorizeSessionSocket({
        cookieHeader: `atelier_session=${signSession("u1")}`,
        sessionId: "s1",
        platform,
      }),
    ).toMatchObject({ ok: true, userId: "u1", workspaceId: "w1" });
    rmSync(dir, { recursive: true, force: true });
  });
});
