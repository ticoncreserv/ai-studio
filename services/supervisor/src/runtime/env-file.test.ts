import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { connectionsFromEnv, mergeWorktreeEnv, parseEnvFile, redactEnv } from "./env-file.js";

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
  });
});
