import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "./store.js";
import { createPlatformStore } from "./store-factory.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env.ATELIER_STORE;
  delete process.env.DATABASE_URL;
});

describe("platform store factory", () => {
  it("stays on json unless a store mode is selected", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-factory-"));
    dirs.push(dir);
    const store = createPlatformStore(join(dir, "platform.json"));
    expect(store.kind).toBe("json");
    expect(store.read().flags.postgresStore).toBe(false);
  });

  it("uses a snapshot replica when postgres is requested without DATABASE_URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-factory-pg-"));
    dirs.push(dir);
    const json = new JsonStore(join(dir, "platform.json"));
    json.update((db) => {
      db.flags.postgresStore = true;
    });
    process.env.ATELIER_STORE = "postgres";
    const store = createPlatformStore(join(dir, "platform.json"));
    expect(store.kind).toBe("postgres");
    store.update((db) => {
      db.users.push({
        id: "u1",
        login: "ana",
        name: "Ana",
        email: "ana@example.com",
        locale: "en",
        role: "owner",
      });
    });
    expect(store.read().users[0]?.login).toBe("ana");
  });

  it("shadow-writes json into the snapshot store", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-factory-shadow-"));
    dirs.push(dir);
    process.env.ATELIER_STORE = "shadow";
    const store = createPlatformStore(join(dir, "platform.json"));
    expect(store.kind).toBe("shadow");
    store.update((db) => {
      db.users.push({
        id: "u1",
        login: "ana",
        name: "Ana",
        email: "ana@example.com",
        locale: "en",
        role: "owner",
      });
    });
    expect(store.read().users[0]?.login).toBe("ana");
  });
});
