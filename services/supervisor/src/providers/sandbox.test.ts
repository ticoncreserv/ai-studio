import { describe, expect, it } from "vitest";
import { sandboxCommand, sanitizeAgentEnv } from "./sandbox.js";

describe("agent sandbox", () => {
  it("strips host credentials from the agent environment", () => {
    const env = sanitizeAgentEnv({
      AWS_SECRET_ACCESS_KEY: "secret",
      CURSOR_API_KEY: "keep",
      PATH: "/usr/bin",
    });
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.CURSOR_API_KEY).toBe("keep");
    expect(env.ATELIER_AGENT_SANDBOX).toBe("1");
  });

  it("keeps the original command when bubblewrap is absent", () => {
    const wrapped = sandboxCommand("agent", ["acp"], "/ws", false);
    expect(wrapped).toEqual({ command: "agent", args: ["acp"] });
  });
});
