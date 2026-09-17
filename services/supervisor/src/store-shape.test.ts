import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "./store.js";
import { assembleDb, compareStoreShapes, flattenDb } from "./store-shape.js";
import { importJsonIntoStore, ShadowStore, SnapshotStore } from "./store-postgres.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("store shape", () => {
  it("round-trips sessions and leases through flattened rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-store-"));
    dirs.push(dir);
    const json = new JsonStore(join(dir, "platform.json"));
    json.update((db) => {
      db.users.push({
        id: "u1",
        login: "ana",
        name: "Ana",
        email: "ana@example.com",
        locale: "en",
        role: "owner",
      });
      db.runLock.w1 = { sessionId: "s1", userId: "u1", leaseUntil: "t" };
      db.sessions.push({
        id: "s1",
        workspaceId: "w1",
        title: "Hello",
        provider: "cursor",
        createdAt: "t",
        events: [{ type: "user_message", id: "e1", at: "t", text: "hi", attachments: [], mentions: [] }],
      });
    });
    const rows = flattenDb(json.read());
    expect(rows.events).toHaveLength(1);
    expect(rows.leases).toHaveLength(1);
    const again = assembleDb(rows, json.read());
    expect(compareStoreShapes(json.read(), again)).toEqual([]);
    expect(again.sessions[0]?.events[0]).toMatchObject({ type: "user_message", text: "hi" });
  });

  it("imports json into a snapshot replica", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-import-"));
    dirs.push(dir);
    const json = new JsonStore(join(dir, "platform.json"));
    json.update((db) => {
      db.users.push({
        id: "u1",
        login: "ana",
        name: "Ana",
        email: "ana@example.com",
        locale: "en",
        role: "owner",
      });
    });
    const snapshot = new SnapshotStore(join(dir, "platform.pg.json"), () => json.read());
    const imported = importJsonIntoStore(json, snapshot);
    expect(imported.records).toBeGreaterThan(0);
    const shadow = new ShadowStore(json, snapshot);
    shadow.update((db) => {
      db.users[0]!.name = "Ana L.";
    });
    expect(snapshot.read().users[0]?.name).toBe("Ana L.");
  });
});
