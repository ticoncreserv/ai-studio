import type { UsageSummary } from "@atelier/contracts";

/** Millions of tokens are unreadable unformatted, and admins still need the exact figure. */
export function formatTokens(value: number, locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.round(value)));
}

/** Short labels on a plan card: 20,000,000 → 20M, 500,000 → 500k. */
export function formatTokenCompact(value: number, locale = "pt-BR"): string {
  if (value <= 0) return "0";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: millions >= 10 ? 0 : 1 }).format(millions)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: thousands >= 10 ? 0 : 1 }).format(thousands)}k`;
  }
  return formatTokens(value, locale);
}

export function usageBarWidth(usage: Pick<UsageSummary, "unlimited" | "percentUsed">): string {
  if (usage.unlimited) return "0%";
  return `${Math.min(100, Math.max(0, usage.percentUsed))}%`;
}

export function usageBarTone(decision: UsageSummary["decision"]["decision"]): string {
  if (decision === "block") return "bg-red-500";
  if (decision === "warn") return "bg-amber-500";
  return "bg-emerald-500";
}
