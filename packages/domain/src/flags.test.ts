import { describe, expect, it } from "vitest";
import { defaultFlags, isFlagOn } from "./flags.js";
import { defaultBudget, budgetExceeded } from "./budget.js";
import { defaultDiskPolicy, overDiskQuota, shouldHibernate } from "./quota.js";

describe("flags budget quota", () => {
  it("keeps publish off and spectator on by default", () => {
    expect(isFlagOn(defaultFlags, "publish")).toBe(false);
    expect(isFlagOn(defaultFlags, "spectator")).toBe(true);
    expect(isFlagOn(defaultFlags, "transactionalReview")).toBe(true);
    expect(isFlagOn(defaultFlags, "autoPush")).toBe(false);
  });

  it("cuts a run when tool calls exceed the budget", () => {
    expect(budgetExceeded(defaultBudget(), { startedAt: Date.now(), toolCalls: 81, costUsd: 0 })).toBe("toolCalls");
  });

  it("hibernates idle workspaces and flags disk overage", () => {
    const policy = defaultDiskPolicy();
    expect(shouldHibernate(policy.hibernateAfterMs, policy)).toBe(true);
    expect(overDiskQuota(policy.maxBytesPerWorkspace + 1, policy)).toBe(true);
  });
});
