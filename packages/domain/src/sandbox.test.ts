import { describe, expect, it } from "vitest";
import { defaultFlags } from "./flags.js";
import { resolveSandboxProfile } from "./sandbox.js";

describe("sandbox profile", () => {
  it("follows sandboxedAgent then sandboxRequired", () => {
    expect(resolveSandboxProfile({ ...defaultFlags, sandboxedAgent: false }, {})).toBe("disabled");
    expect(resolveSandboxProfile({ ...defaultFlags, sandboxedAgent: true, sandboxRequired: false }, {})).toBe("best-effort");
    expect(resolveSandboxProfile({ ...defaultFlags, sandboxedAgent: true, sandboxRequired: true }, {})).toBe("required");
  });

  it("lets ATELIER_SANDBOX_PROFILE override flags", () => {
    expect(resolveSandboxProfile(defaultFlags, { ATELIER_SANDBOX_PROFILE: "disabled" })).toBe("disabled");
    expect(resolveSandboxProfile({ ...defaultFlags, sandboxedAgent: false }, { ATELIER_SANDBOX_PROFILE: "required" })).toBe("required");
  });
});
