import { describe, expect, it } from "vitest";
import type { UsageSummary } from "@atelier/contracts";
import {
  dismissUsageAlert,
  formatTokens,
  formatTokenCompact,
  isUsageAlertDismissed,
  usageAlertKind,
  usageAlertStorageKey,
  usageBarTone,
  usageBarWidth,
} from "./usage";

function usage(
  over: Partial<Pick<UsageSummary, "unlimited" | "remainingTokens" | "limitTokens" | "decision">> = {},
): Pick<UsageSummary, "unlimited" | "remainingTokens" | "limitTokens" | "decision"> {
  return {
    unlimited: false,
    remainingTokens: 5_000,
    limitTokens: 10_000,
    decision: { decision: "allow", reason: null },
    ...over,
  };
}

describe("usage formatting", () => {
  it("groups token counts per locale", () => {
    expect(formatTokens(4_000_000, "en")).toBe("4,000,000");
    expect(formatTokens(1234.6, "en")).toBe("1,235");
    expect(formatTokens(-5, "en")).toBe("0");
  });

  it("compacts plan caps for the ledger caption", () => {
    expect(formatTokenCompact(20_000_000, "en")).toBe("20M");
    expect(formatTokenCompact(5_000_000, "en")).toBe("5M");
    expect(formatTokenCompact(500_000, "en")).toBe("500k");
    expect(formatTokenCompact(0, "en")).toBe("0");
  });

  it("clamps the bar and keeps an unlimited profile empty", () => {
    expect(usageBarWidth({ unlimited: false, percentUsed: 42 })).toBe("42%");
    expect(usageBarWidth({ unlimited: false, percentUsed: 180 })).toBe("100%");
    expect(usageBarWidth({ unlimited: true, percentUsed: 0 })).toBe("0%");
  });

  it("colors the bar by decision", () => {
    expect(usageBarTone("allow")).toBe("bg-emerald-500");
    expect(usageBarTone("warn")).toBe("bg-amber-500");
    expect(usageBarTone("block")).toBe("bg-red-500");
  });
});

describe("usageAlertKind", () => {
  it("stays quiet on an unlimited profile", () => {
    expect(usageAlertKind(usage({ unlimited: true, remainingTokens: 0 }))).toBeNull();
  });

  it("warns below 20% remaining and stays quiet at 21%", () => {
    expect(usageAlertKind(usage({ remainingTokens: 2_100, limitTokens: 10_000 }))).toBeNull();
    expect(usageAlertKind(usage({ remainingTokens: 1_900, limitTokens: 10_000 }))).toBe("warn");
  });

  it("treats a spent monthly cap as exhausted", () => {
    expect(usageAlertKind(usage({ remainingTokens: 0, limitTokens: 10_000 }))).toBe("exhausted");
  });

  it("treats a monthly, daily, or cost block as exhausted", () => {
    expect(usageAlertKind(usage({ remainingTokens: 4_000, decision: { decision: "block", reason: "monthly" } }))).toBe(
      "exhausted",
    );
    expect(usageAlertKind(usage({ remainingTokens: 4_000, decision: { decision: "block", reason: "daily" } }))).toBe(
      "exhausted",
    );
    expect(usageAlertKind(usage({ remainingTokens: 4_000, decision: { decision: "block", reason: "cost" } }))).toBe(
      "exhausted",
    );
  });

  it("does not treat a provider or per-run block as a credit alert", () => {
    expect(usageAlertKind(usage({ decision: { decision: "block", reason: "provider" } }))).toBeNull();
    expect(usageAlertKind(usage({ decision: { decision: "block", reason: "perRun" } }))).toBeNull();
  });

  it("warns when the profile decision already fired", () => {
    expect(
      usageAlertKind(usage({ remainingTokens: 6_000, decision: { decision: "warn", reason: "monthly" } })),
    ).toBe("warn");
  });
});

describe("usage alert dismiss", () => {
  it("keys dismiss per user, period, and kind", () => {
    expect(usageAlertStorageKey("u1", "2026-09", "warn")).toBe("atelier.usage-alert:u1:2026-09:warn");
  });

  it("remembers a dismiss without hiding the other kind", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const warn = usageAlertStorageKey("u1", "2026-09", "warn");
    const exhausted = usageAlertStorageKey("u1", "2026-09", "exhausted");
    expect(isUsageAlertDismissed(warn, storage)).toBe(false);
    dismissUsageAlert(warn, storage);
    expect(isUsageAlertDismissed(warn, storage)).toBe(true);
    expect(isUsageAlertDismissed(exhausted, storage)).toBe(false);
  });
});
