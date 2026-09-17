import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      db.providers.cursor = {
        enabled: true,
        model: "gpt-5",
        keys: [{ ref: "CURSOR_API_KEY", label: "primary", enabled: true, failures: 0, lastUsedAt: null, lastFailureAt: null, cooldownUntil: null, lastError: null, lastFailureKind: null }],
        models: [{ id: "gpt-5", label: "GPT-5" }],
      };
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
    expect(rows.providers.find((row) => row.id === "cursor")).toMatchObject({ model: "gpt-5" });
    const again = assembleDb(rows, json.read());
    expect(compareStoreShapes(json.read(), again)).toEqual([]);
    expect(again.sessions[0]?.events[0]).toMatchObject({ type: "user_message", text: "hi" });
  });

  it("round-trips usage profiles, ledger, rollups, and grants", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-usage-shape-"));
    dirs.push(dir);
    const json = new JsonStore(join(dir, "platform.json"));
    expect(json.read().usageProfiles.map((row) => row.id)).toEqual(["starter", "standard", "premium"]);
    json.update((db) => {
      db.usageProfiles = db.usageProfiles.map((row) =>
        row.id === "starter" ? { ...row, limits: { ...row.limits, monthlyTokens: 1_234 } } : row,
      );
      db.usageLedger.push({
        id: "l1",
        userId: "u1",
        workspaceId: "w1",
        sessionId: "s1",
        runId: "r1",
        provider: "cursor",
        at: "2026-09-10T00:00:00.000Z",
        periodKey: "2026-09",
        dayKey: "2026-09-10",
        inputTokens: 10,
        outputTokens: 20,
        estimatedTokens: 30,
        contextPeakTokens: 40,
        costUsd: 0.5,
        toolCalls: 1,
        source: "mixed",
      });
      db.usageRollups.push({ userId: "u1", periodKey: "2026-08", tokens: 90, costUsd: 1, runs: 3, lastRunAt: "2026-08-31T00:00:00.000Z" });
      db.usageGrants.push({ id: "g1", userId: "u1", periodKey: "2026-09", tokens: 500, reason: "launch", byUserId: "admin", at: "2026-09-09T00:00:00.000Z" });
    });
    const rows = flattenDb(json.read());
    expect(rows.usageLedger).toHaveLength(1);
    expect(compareStoreShapes(json.read(), assembleDb(rows, json.read()))).toEqual([]);
  });

  it("keeps the seeded profiles for a store written before usage limits existed", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-usage-legacy-"));
    dirs.push(dir);
    const file = join(dir, "platform.json");
    writeFileSync(file, JSON.stringify({ users: [], workspaces: [], sessions: [] }));
    const json = new JsonStore(file);
    expect(json.read().usageProfiles.map((row) => row.id)).toEqual(["starter", "standard", "premium"]);
    expect(json.read().usageLedger).toEqual([]);
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
