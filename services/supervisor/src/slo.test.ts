import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProcessRuntime } from "./runtime/process.js";
import { isolationEnv, PREVIEW_SIDE_EFFECTS, validateEnvContract, defaultWorkspaceSpec } from "./runtime/spec.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("preview SLO helpers", () => {
  it("hardlinks or copies vendor snapshots during provision", async () => {
    const source = mkdtempSync(join(tmpdir(), "src-"));
    const root = mkdtempSync(join(tmpdir(), "rt-"));
    dirs.push(source, root);
    writeFileSync(join(source, "README.md"), "fixture");
    const runtime = new ProcessRuntime(root);
    const started = Date.now();
    const { worktree } = await runtime.provision({
      workspaceId: "w1",
      branch: "user/demo/studio",
      sourceDir: source,
      user: { name: "Demo", email: "demo@users.noreply.github.com" },
    });
    expect(worktree).toContain("w1");
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  it("validates isolation env and side-effect profile", () => {
    const spec = defaultWorkspaceSpec();
    const env: Record<string, string> = {
      ...PREVIEW_SIDE_EFFECTS,
      ...isolationEnv("abc", "http://127.0.0.1:1"),
      APP_KEY: "base64:test",
      DB_CONNECTION: "mariadb",
    };
    expect(env.MAIL_MAILER).toBe("log");
    expect(env.QUEUE_NAME).toContain("atelier_");
    expect(validateEnvContract(spec, env).missing).toEqual([]);
  });
});
