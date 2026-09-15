import { describe, expect, it } from "vitest";
import { canTransition, transition } from "./workspace-fsm.js";

describe("workspace fsm", () => {
  it("allows provisioning to ready", () => {
    expect(canTransition("provisioning", "ready")).toBe(true);
    expect(transition("provisioning", "ready")).toBe("ready");
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("destroyed", "ready")).toBe(false);
    expect(() => transition("destroyed", "ready")).toThrow(/Illegal/);
  });
});
