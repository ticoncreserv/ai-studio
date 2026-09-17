import { describe, expect, it } from "vitest";
import { formatTokens, formatTokenCompact, usageBarTone, usageBarWidth } from "./usage";

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
