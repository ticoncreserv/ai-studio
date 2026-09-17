import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sandboxCommand, sanitizeAgentEnv, wrapSandbox } from "./sandbox.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("agent sandbox", () => {
  it("strips host credentials from the agent environment", () => {
    const env = sanitizeAgentEnv(
      {
        AWS_SECRET_ACCESS_KEY: "secret",
        CURSOR_API_KEY: "keep",
        ANTHROPIC_API_KEY: "drop",
        OPENAI_API_KEY: "drop-openai",
        PATH: "/usr/bin",
      },
      ["CURSOR_API_KEY"],
    );
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.CURSOR_API_KEY).toBe("keep");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ATELIER_AGENT_SANDBOX).toBe("1");
  });

  it("keeps the original command when bubblewrap is absent", () => {
    const wrapped = sandboxCommand("agent", ["acp"], "/ws", false);
    expect(wrapped).toEqual({ command: "agent", args: ["acp"] });
  });

  it("fails closed when the sandbox profile is required and no backend exists", () => {
    expect(() => wrapSandbox("agent", ["acp"], "/ws", "required", { PATH: "/usr/bin" })).toThrow(/required/);
  });

  it("leaves the command unwrapped in best-effort mode without a backend", () => {
    const wrapped = wrapSandbox("agent", ["acp"], "/ws", "best-effort", { PATH: "/usr/bin" });
    expect(wrapped).toMatchObject({ command: "agent", args: ["acp"], backend: null });
  });

  it("binds the CLI HOME into the sandbox next to the worktree", () => {
    const bin = mkdtempSync(join(tmpdir(), "atelier-bwrap-"));
    dirs.push(bin);
    writeFileSync(join(bin, "bwrap"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const wrapped = wrapSandbox("agent", ["acp"], "/ws", "best-effort", {
      PATH: bin,
      HOME: "/var/cursor-home/default",
      ATELIER_SANDBOX_BACKEND: "bwrap",
    });
    expect(wrapped.backend).toBe("bwrap");
    expect(wrapped.args).toEqual([
      "--unshare-pid",
      "--die-with-parent",
      "--bind",
      "/ws",
      "/ws",
      "--bind",
      "/var/cursor-home/default",
      "/var/cursor-home/default",
      "--chdir",
      "/ws",
      "agent",
      "acp",
    ]);
  });
});
