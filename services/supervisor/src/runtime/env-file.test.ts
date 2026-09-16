import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  artisanOfflineEnv,
  connectionsFromEnv,
  mergeWorktreeEnv,
  parseEnvFile,
  readEnvFile,
  readUserEnv,
  redactEnv,
  writeGlobalEnv,
  writeUserEnv,
} from "./env-file.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("env-file", () => {
  it("parses, redacts, and merges isolation over the example file", () => {
    const parsed = parseEnvFile("APP_NAME=Portal\n# comment\nDB_PASSWORD=secret\n");
    expect(parsed.APP_NAME).toBe("Portal");
    expect(redactEnv(parsed).DB_PASSWORD).toBe("••••");
    const dir = mkdtempSync(join(tmpdir(), "atelier-env-"));
    dirs.push(dir);
    writeFileSync(join(dir, ".env.example"), "APP_KEY=\nDB_HOST=127.0.0.1\nDB_DATABASE=portal\n");
    const merged = mergeWorktreeEnv(dir, { APP_URL: "http://studio/-/p/abc", SESSION_COOKIE: "atelier_x_session" });
    expect(merged.APP_URL).toBe("http://studio/-/p/abc");
    expect(merged.APP_KEY?.startsWith("base64:")).toBe(true);
    expect(connectionsFromEnv(merged)[0]?.database).toBe("portal");
    expect(connectionsFromEnv(merged)[0]?.port).toBe(3306);
  });

  it("reads prefix and DB_HOST_* connections with ports", () => {
    const rows = connectionsFromEnv({
      DB_CONNECTION: "mysql",
      DB_HOST: "10.0.128.112",
      DB_PORT: "3306",
      DB_DATABASE: "portal",
      TOPCON_DB_HOST: "10.0.128.12",
      TOPCON_DB_PORT: "3306",
      TOPCON_DB_DATABASE: "topcon",
      DB_HOST_BETON: "10.10.0.211",
      DB_PORT_BETON: "1433",
      DB_DATABASE_BETON: "beton",
    });
    expect(rows.find((row) => row.id === "app")?.port).toBe(3306);
    expect(rows.find((row) => row.id === "topcon")).toMatchObject({
      host: "10.0.128.12",
      port: 3306,
      kind: "erp",
      driver: "mariadb",
    });
    expect(rows.find((row) => row.id === "beton")).toMatchObject({
      host: "10.10.0.211",
      port: 1433,
      driver: "sqlsrv",
      kind: "erp",
    });
  });

  it("points artisan CLI at sqlite so 10.x hosts cannot block Wayfinder", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-off-"));
    dirs.push(dir);
    const offline = artisanOfflineEnv(
      { DB_CONNECTION: "mysql", DB_HOST: "10.0.128.112", DB_HOST_BETON: "10.10.0.211", DB_PORT: "3306" },
      dir,
    );
    expect(offline.DB_CONNECTION).toBe("sqlite");
    expect(offline.DB_HOST).toBe("127.0.0.1");
    expect(offline.DB_HOST_BETON).toBe("127.0.0.1");
    expect(offline.DB_PORT).toBe("1");
    expect(offline.DB_DATABASE).toContain("atelier-offline.sqlite");
  });

  it("merges global then user then isolation, and keeps APP_KEY", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-layers-"));
    const envRoot = join(dir, "env");
    dirs.push(dir);
    writeFileSync(join(dir, ".env.example"), "APP_KEY=\nDB_HOST=127.0.0.1\nDB_DATABASE=portal\nCACHE_STORE=redis\n");
    writeGlobalEnv({ DB_HOST: "10.0.0.1", DB_PASSWORD: "shared", CACHE_STORE: "redis" }, envRoot);
    writeUserEnv("u1", { DB_HOST: "10.0.0.9", EXTRA: "mine" }, envRoot);
    const first = mergeWorktreeEnv(dir, { APP_URL: "http://studio/-/p/a", CACHE_STORE: "file" }, { userId: "u1", envRoot });
    expect(first.DB_HOST).toBe("10.0.0.9");
    expect(first.DB_PASSWORD).toBe("shared");
    expect(first.EXTRA).toBe("mine");
    expect(first.CACHE_STORE).toBe("file");
    expect(first.APP_URL).toBe("http://studio/-/p/a");
    const key = first.APP_KEY;
    writeGlobalEnv({ DB_HOST: "10.0.0.1", DB_PASSWORD: "shared-2" }, envRoot);
    const second = mergeWorktreeEnv(dir, { APP_URL: "http://studio/-/p/a", CACHE_STORE: "file" }, { userId: "u1", envRoot });
    expect(second.DB_PASSWORD).toBe("shared-2");
    expect(second.APP_KEY).toBe(key);
    expect(second.EXTRA).toBe("mine");
  });

  it("migrates existing worktree extras into an empty user overlay once", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-mig-"));
    const envRoot = join(dir, "env");
    dirs.push(dir);
    writeFileSync(join(dir, ".env.example"), "APP_KEY=\nDB_HOST=127.0.0.1\n");
    writeFileSync(join(dir, ".env"), "APP_KEY=base64:keep\nDB_HOST=10.1.1.1\nCUSTOM=yes\n");
    mergeWorktreeEnv(dir, { APP_URL: "http://x" }, { userId: "u2", envRoot });
    expect(readUserEnv("u2", envRoot)).toMatchObject({ DB_HOST: "10.1.1.1", CUSTOM: "yes" });
    writeGlobalEnv({ DB_HOST: "10.0.0.1" }, envRoot);
    writeUserEnv("u2", { CUSTOM: "yes" }, envRoot);
    const merged = mergeWorktreeEnv(dir, { APP_URL: "http://x" }, { userId: "u2", envRoot });
    expect(merged.DB_HOST).toBe("10.0.0.1");
    expect(merged.CUSTOM).toBe("yes");
    expect(readEnvFile(join(dir, ".env")).APP_KEY).toBe("base64:keep");
  });
});
