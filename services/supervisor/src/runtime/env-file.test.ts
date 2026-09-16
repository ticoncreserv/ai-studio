import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { artisanOfflineEnv, connectionsFromEnv, mergeWorktreeEnv, parseEnvFile, redactEnv } from "./env-file.js";

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
});
