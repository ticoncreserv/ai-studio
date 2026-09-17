import type { UsageSummary } from "@atelier/contracts";

/** Millions of tokens are unreadable unformatted, and admins still need the exact figure. */
export function formatTokens(value: number, locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.round(value)));
}

export function usageBarWidth(usage: Pick<UsageSummary, "unlimited" | "percentUsed">): string {
  if (usage.unlimited) return "0%";
  return `${Math.min(100, Math.max(0, usage.percentUsed))}%`;
}

export function usageBarTone(decision: UsageSummary["decision"]["decision"]): string {
  if (decision === "block") return "bg-coral-500";
  if (decision === "warn") return "bg-amber-500";
  return "bg-emerald-500";
}
