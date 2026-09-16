import { describe, expect, it } from "vitest";
import { canTransition, transition } from "./workspace-fsm.js";

describe("workspace fsm", () => {
  it("allows provisioning to ready", () => {
    expect(canTransition("provisioning", "ready")).toBe(true);
    expect(transition("provisioning", "ready")).toBe("ready");
  });

  it("recovers from a failed preview", () => {
    expect(canTransition("error", "running")).toBe(true);
    expect(transition("error", "running")).toBe("running");
    expect(canTransition("error", "ready")).toBe(true);
    expect(canTransition("hibernated", "error")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("destroyed", "ready")).toBe(false);
    expect(() => transition("destroyed", "ready")).toThrow(/Illegal/);
  });
});
