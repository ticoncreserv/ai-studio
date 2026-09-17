import { describe, expect, it } from "vitest";
import {
  aggregateUsage,
  billableTokens,
  createUsageProfile,
  defaultUsageProfiles,
  evaluateUsage,
  grantedTokens,
  mergeRollups,
  resolveUsageProfile,
  rollupFromEntries,
  runBudgetFromProfile,
  splitExpiredEntries,
  summarizeUsage,
  usageDayKey,
  usagePeriodKey,
  usageProfileIdFromLabel,
  usageRetentionDays,
  type UsageGrant,
  type UsageLedgerEntry,
} from "./usage.js";

const entry = (over: Partial<UsageLedgerEntry> = {}): UsageLedgerEntry => ({
  id: "e1",
  userId: "u1",
  workspaceId: "w1",
  sessionId: "s1",
  runId: "r1",
  provider: "cursor",
  at: "2026-09-10T12:00:00.000Z",
  periodKey: "2026-09",
  dayKey: "2026-09-10",
  inputTokens: 1_000,
  outputTokens: 2_000,
  estimatedTokens: 3_000,
  contextPeakTokens: 0,
  costUsd: 0,
  toolCalls: 2,
  source: "estimated",
  ...over,
});

describe("usage profiles", () => {
  it("seeds three profiles with standard as the fallback", () => {
    const profiles = defaultUsageProfiles();
    expect(profiles.map((row) => row.id)).toEqual(["starter", "standard", "premium"]);
    expect(resolveUsageProfile({}, profiles).id).toBe("standard");
    expect(resolveUsageProfile({ usageProfileId: "premium" }, profiles).id).toBe("premium");
    expect(resolveUsageProfile({ usageProfileId: "gone" }, profiles).id).toBe("standard");
  });

  it("falls back to the seeds when the store has no profiles", () => {
    expect(resolveUsageProfile({ usageProfileId: "starter" }, []).id).toBe("starter");
  });

  it("slugs a plan name and avoids colliding ids", () => {
    expect(usageProfileIdFromLabel("Agency Desk")).toBe("agency-desk");
    expect(usageProfileIdFromLabel("Agência")).toBe("agencia");
    expect(usageProfileIdFromLabel("Agency", ["agency"])).toBe("agency-2");
    expect(usageProfileIdFromLabel("!!!", ["plan", "plan-2"])).toBe("plan-3");
  });

  it("copies the standard cap when creating a plan", () => {
    const created = createUsageProfile("Agency", defaultUsageProfiles());
    expect(created.id).toBe("agency");
    expect(created.label).toBe("Agency");
    expect(created.limits).toEqual(defaultUsageProfiles()[1]!.limits);
  });

  it("keeps the shared run budget when a profile sets no tool call cap", () => {
    const profile = { ...defaultUsageProfiles()[1]!, limits: { ...defaultUsageProfiles()[1]!.limits, perRunToolCalls: 0 } };
    expect(runBudgetFromProfile(profile).maxToolCalls).toBe(80);
    expect(runBudgetFromProfile(defaultUsageProfiles()[0]!).maxToolCalls).toBe(40);
  });
});

describe("period keys", () => {
  it("uses the configured timezone, not UTC", () => {
    // 2026-10-01T01:30Z is still September 30 in São Paulo (UTC-3).
    const at = new Date("2026-10-01T01:30:00.000Z");
    expect(usagePeriodKey(at, "America/Sao_Paulo")).toBe("2026-09");
    expect(usageDayKey(at, "America/Sao_Paulo")).toBe("2026-09-30");
    expect(usagePeriodKey(at, "UTC")).toBe("2026-10");
    expect(usageDayKey(at, "UTC")).toBe("2026-10-01");
  });
});

describe("billable tokens", () => {
  it("resolves the estimate against the provider context peak", () => {
    const row = { estimatedTokens: 3_000, contextPeakTokens: 53_000 };
    expect(billableTokens(row, "estimated")).toBe(3_000);
    expect(billableTokens(row, "context_peak")).toBe(53_000);
    expect(billableTokens(row, "max")).toBe(53_000);
    expect(billableTokens({ estimatedTokens: 90_000, contextPeakTokens: 0 }, "max")).toBe(90_000);
  });
});

describe("aggregate", () => {
  it("sums the open period and day", () => {
    const aggregate = aggregateUsage({
      entries: [
        entry(),
        entry({ id: "e2", at: "2026-09-11T09:00:00.000Z", dayKey: "2026-09-11", costUsd: 0.25 }),
        entry({ id: "e3", userId: "u2", estimatedTokens: 999 }),
        entry({ id: "e4", periodKey: "2026-08", dayKey: "2026-08-02" }),
      ],
      rollups: [],
      userId: "u1",
      periodKey: "2026-09",
      dayKey: "2026-09-10",
      meter: "max",
    });
    expect(aggregate.periodTokens).toBe(6_000);
    expect(aggregate.dayTokens).toBe(3_000);
    expect(aggregate.periodCostUsd).toBe(0.25);
    expect(aggregate.runs).toBe(2);
    expect(aggregate.lastRunAt).toBe("2026-09-11T09:00:00.000Z");
  });

  it("reads the rollup only when raw entries for the period are gone", () => {
    const rollups = [{ userId: "u1", periodKey: "2026-09", tokens: 500, costUsd: 1, runs: 4, lastRunAt: "2026-09-02T00:00:00.000Z" }];
    const withRaw = aggregateUsage({ entries: [entry()], rollups, userId: "u1", periodKey: "2026-09", dayKey: "2026-09-10", meter: "max" });
    expect(withRaw.periodTokens).toBe(3_000);
    const pruned = aggregateUsage({ entries: [], rollups, userId: "u1", periodKey: "2026-09", dayKey: "2026-09-10", meter: "max" });
    expect(pruned.periodTokens).toBe(500);
    expect(pruned.runs).toBe(4);
  });
});

describe("evaluate", () => {
  const limits = { monthlyTokens: 10_000, dailyTokens: 5_000, perRunTokens: 1_000, perRunToolCalls: 10, monthlyCostUsd: 0 };
  const aggregate = { periodTokens: 0, dayTokens: 0, periodCostUsd: 0, runs: 0, lastRunAt: null };

  it("allows a run inside every limit", () => {
    const decision = evaluateUsage({ limits, aggregate, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, pendingTokens: 100 });
    expect(decision).toEqual({ decision: "allow", reason: null });
  });

  it("treats 0 as unlimited", () => {
    const decision = evaluateUsage({
      limits: { monthlyTokens: 0, dailyTokens: 0, perRunTokens: 0, perRunToolCalls: 0, monthlyCostUsd: 0 },
      aggregate: { ...aggregate, periodTokens: 9_000_000 },
      grantedTokens: 0,
      enforcement: "block",
      warnAtPercent: 80,
      pendingTokens: 5_000_000,
    });
    expect(decision).toEqual({ decision: "allow", reason: null });
  });

  it("blocks the per-run cap before the period caps", () => {
    const decision = evaluateUsage({ limits, aggregate, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, pendingTokens: 4_000 });
    expect(decision).toEqual({ decision: "block", reason: "perRun" });
  });

  it("blocks the daily cap and the monthly cap", () => {
    expect(
      evaluateUsage({ limits, aggregate: { ...aggregate, dayTokens: 4_900 }, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, pendingTokens: 200 }),
    ).toEqual({ decision: "block", reason: "daily" });
    expect(
      evaluateUsage({ limits, aggregate: { ...aggregate, periodTokens: 9_950 }, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, pendingTokens: 100 }),
    ).toEqual({ decision: "block", reason: "monthly" });
  });

  it("downgrades a block to a warning in warn mode", () => {
    expect(
      evaluateUsage({ limits, aggregate: { ...aggregate, periodTokens: 10_000 }, grantedTokens: 0, enforcement: "warn", warnAtPercent: 80, pendingTokens: 100 }),
    ).toEqual({ decision: "warn", reason: "monthly" });
  });

  it("lets a grant buy room back", () => {
    const over = { ...aggregate, periodTokens: 10_000 };
    expect(evaluateUsage({ limits, aggregate: over, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, pendingTokens: 100 }).decision).toBe("block");
    expect(evaluateUsage({ limits, aggregate: over, grantedTokens: 50_000, enforcement: "block", warnAtPercent: 80, pendingTokens: 100 }).decision).toBe("allow");
  });

  it("warns at the threshold before anything is exceeded", () => {
    const decision = evaluateUsage({ limits, aggregate: { ...aggregate, periodTokens: 8_000 }, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, pendingTokens: 0 });
    expect(decision).toEqual({ decision: "warn", reason: "monthly" });
  });

  it("blocks a provider outside the profile list", () => {
    expect(
      evaluateUsage({ limits, aggregate, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, provider: "grok", allowedProviders: ["cursor"] }),
    ).toEqual({ decision: "block", reason: "provider" });
    expect(
      evaluateUsage({ limits, aggregate, grantedTokens: 0, enforcement: "block", warnAtPercent: 80, provider: "grok", allowedProviders: [] }).decision,
    ).toBe("allow");
  });

  it("blocks on the cost cap when a provider reports cost", () => {
    expect(
      evaluateUsage({
        limits: { ...limits, monthlyCostUsd: 10 },
        aggregate: { ...aggregate, periodCostUsd: 12 },
        grantedTokens: 0,
        enforcement: "block",
        warnAtPercent: 80,
      }),
    ).toEqual({ decision: "block", reason: "cost" });
  });
});

describe("summary", () => {
  it("reports remaining, percent, and the decision", () => {
    const seed = defaultUsageProfiles()[0]!;
    const profile = { ...seed, limits: { ...seed.limits, dailyTokens: 0 } };
    const summary = summarizeUsage({
      userId: "u1",
      profile,
      entries: [entry({ estimatedTokens: 4_000_000, at: "2026-09-10T12:00:00.000Z" })],
      rollups: [],
      grants: [],
      at: new Date("2026-09-10T12:30:00.000Z"),
      tz: "America/Sao_Paulo",
    });
    expect(summary.periodTokens).toBe(4_000_000);
    expect(summary.limitTokens).toBe(5_000_000);
    expect(summary.remainingTokens).toBe(1_000_000);
    expect(summary.percentUsed).toBe(80);
    expect(summary.unlimited).toBe(false);
    expect(summary.decision).toEqual({ decision: "warn", reason: "monthly" });
  });

  it("blocks on the daily cap even when the month still has room", () => {
    const summary = summarizeUsage({
      userId: "u1",
      profile: defaultUsageProfiles()[0]!,
      entries: [entry({ estimatedTokens: 600_000, at: "2026-09-10T12:00:00.000Z" })],
      rollups: [],
      grants: [],
      at: new Date("2026-09-10T12:30:00.000Z"),
      tz: "America/Sao_Paulo",
    });
    expect(summary.remainingTokens).toBe(4_400_000);
    expect(summary.decision).toEqual({ decision: "block", reason: "daily" });
  });

  it("marks an uncapped profile as unlimited", () => {
    const profile = {
      ...defaultUsageProfiles()[2]!,
      limits: { monthlyTokens: 0, dailyTokens: 0, perRunTokens: 0, perRunToolCalls: 0, monthlyCostUsd: 0 },
    };
    const summary = summarizeUsage({ userId: "u1", profile, entries: [entry()], rollups: [], grants: [] });
    expect(summary.unlimited).toBe(true);
    expect(summary.percentUsed).toBe(0);
    expect(summary.decision.decision).toBe("allow");
  });
});

describe("grants and rollups", () => {
  it("sums grants for the open period only", () => {
    const grants: UsageGrant[] = [
      { id: "g1", userId: "u1", periodKey: "2026-09", tokens: 1_000, reason: "release", byUserId: "admin", at: "" },
      { id: "g2", userId: "u1", periodKey: "2026-08", tokens: 9_000, reason: "old", byUserId: "admin", at: "" },
      { id: "g3", userId: "u2", periodKey: "2026-09", tokens: 500, reason: "other", byUserId: "admin", at: "" },
    ];
    expect(grantedTokens(grants, "u1", "2026-09")).toBe(1_000);
  });

  it("rolls entries up per user and period, then merges", () => {
    const rollups = rollupFromEntries(
      [entry(), entry({ id: "e2", at: "2026-09-12T00:00:00.000Z", costUsd: 0.5 }), entry({ id: "e3", userId: "u2" })],
      "max",
    );
    expect(rollups).toHaveLength(2);
    const mine = rollups.find((row) => row.userId === "u1")!;
    expect(mine).toMatchObject({ tokens: 6_000, costUsd: 0.5, runs: 2, lastRunAt: "2026-09-12T00:00:00.000Z" });
    const merged = mergeRollups(rollups, [{ userId: "u1", periodKey: "2026-09", tokens: 1_000, costUsd: 0.5, runs: 1, lastRunAt: "2026-09-13T00:00:00.000Z" }]);
    expect(merged.find((row) => row.userId === "u1")).toMatchObject({ tokens: 7_000, costUsd: 1, runs: 3, lastRunAt: "2026-09-13T00:00:00.000Z" });
  });
});

describe("retention", () => {
  it("splits entries older than the window", () => {
    const now = new Date("2026-09-20T00:00:00.000Z");
    const { keep, expired } = splitExpiredEntries([entry({ at: "2026-09-19T00:00:00.000Z" }), entry({ id: "old", at: "2026-01-01T00:00:00.000Z" })], now, 120);
    expect(keep.map((row) => row.id)).toEqual(["e1"]);
    expect(expired.map((row) => row.id)).toEqual(["old"]);
  });

  it("defaults the window and accepts an override", () => {
    expect(usageRetentionDays({})).toBe(120);
    expect(usageRetentionDays({ ATELIER_USAGE_RETENTION_DAYS: "30" })).toBe(30);
    expect(usageRetentionDays({ ATELIER_USAGE_RETENTION_DAYS: "nope" })).toBe(120);
  });
});
