import { describe, expect, it } from "vitest";
import { sandboxCommand, sanitizeAgentEnv, wrapSandbox } from "./sandbox.js";

describe("agent sandbox", () => {
  it("strips host credentials from the agent environment", () => {
    const env = sanitizeAgentEnv(
      {
        AWS_SECRET_ACCESS_KEY: "secret",
        CURSOR_API_KEY: "keep",
        ANTHROPIC_API_KEY: "drop",
        PATH: "/usr/bin",
      },
      ["CURSOR_API_KEY"],
    );
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.CURSOR_API_KEY).toBe("keep");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
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
});
