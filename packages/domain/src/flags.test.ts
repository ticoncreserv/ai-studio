import { describe, expect, it } from "vitest";
import { defaultFlags, isFlagOn } from "./flags.js";
import { defaultBudget, budgetExceeded } from "./budget.js";
import { defaultDiskPolicy, overDiskQuota, shouldAutoResumePreview, shouldHibernate, shouldResetToReadyOnWarm } from "./quota.js";

describe("flags budget quota", () => {
  it("keeps publish off and spectator on by default", () => {
    expect(isFlagOn(defaultFlags, "publish")).toBe(false);
    expect(isFlagOn(defaultFlags, "spectator")).toBe(true);
    expect(isFlagOn(defaultFlags, "transactionalReview")).toBe(true);
    expect(isFlagOn(defaultFlags, "autoPush")).toBe(false);
    expect(isFlagOn(defaultFlags, "sandboxRequired")).toBe(false);
    expect(isFlagOn(defaultFlags, "postgresStore")).toBe(false);
    expect(isFlagOn(defaultFlags, "claudeProvider")).toBe(false);
    expect(isFlagOn(defaultFlags, "geminiProvider")).toBe(false);
    expect(isFlagOn(defaultFlags, "grokProvider")).toBe(false);
    expect(isFlagOn(defaultFlags, "codexProvider")).toBe(false);
    expect(isFlagOn(defaultFlags, "providerCanary")).toBe(false);
    expect(isFlagOn(defaultFlags, "postgresShadowRead")).toBe(false);
    expect(isFlagOn(defaultFlags, "realProviderEvals")).toBe(false);
  });

  it("cuts a run when tool calls exceed the budget", () => {
    expect(budgetExceeded(defaultBudget(), { startedAt: Date.now(), toolCalls: 81, costUsd: 0 })).toBe("toolCalls");
  });

  it("hibernates idle workspaces and flags disk overage", () => {
    const policy = defaultDiskPolicy();
    expect(shouldHibernate(policy.hibernateAfterMs, policy)).toBe(true);
    expect(overDiskQuota(policy.maxBytesPerWorkspace + 1, policy)).toBe(true);
  });

  it("auto-resumes preview on open unless the user pinned hibernate", () => {
    expect(shouldAutoResumePreview({ status: "hibernated" })).toBe(true);
    expect(shouldAutoResumePreview({ status: "ready" })).toBe(true);
    expect(shouldAutoResumePreview({ status: "error" })).toBe(true);
    expect(shouldAutoResumePreview({ status: "running" })).toBe(true);
    expect(shouldAutoResumePreview({ status: "running", previewProcessRunning: true })).toBe(false);
    expect(shouldAutoResumePreview({ status: "provisioning" })).toBe(false);
    expect(shouldAutoResumePreview({ status: "hibernated", hibernatedByUser: true })).toBe(false);
    expect(shouldAutoResumePreview({ status: "ready", hibernatedByUser: true })).toBe(false);
  });

  it("keeps running and user-pinned workspaces when warming", () => {
    expect(shouldResetToReadyOnWarm({ status: "hibernated" })).toBe(true);
    expect(shouldResetToReadyOnWarm({ status: "error" })).toBe(true);
    expect(shouldResetToReadyOnWarm({ status: "running" })).toBe(false);
    expect(shouldResetToReadyOnWarm({ status: "provisioning" })).toBe(false);
    expect(shouldResetToReadyOnWarm({ status: "hibernated", hibernatedByUser: true })).toBe(false);
  });
});
