import type { UsageLimitReason, UsageSummary } from "@atelier/contracts";

export type UsageAlertKind = "warn" | "exhausted";

/** Remaining below this share of the monthly cap is a credit warning, even if the profile warns later. */
export const USAGE_ALERT_REMAINING_RATIO = 0.2;

const CREDIT_ALERT_REASONS = new Set<UsageLimitReason>(["monthly", "daily", "cost"]);

export function usageAlertKind(
  usage: Pick<UsageSummary, "unlimited" | "remainingTokens" | "limitTokens" | "decision">,
): UsageAlertKind | null {
  if (usage.unlimited) return null;
  const reason = usage.decision.reason;
  const creditReason = reason != null && CREDIT_ALERT_REASONS.has(reason);
  if (usage.remainingTokens <= 0) return "exhausted";
  if (usage.decision.decision === "block" && creditReason) return "exhausted";
  if (usage.limitTokens > 0 && usage.remainingTokens / usage.limitTokens < USAGE_ALERT_REMAINING_RATIO) {
    return "warn";
  }
  if (usage.decision.decision === "warn" && creditReason) return "warn";
  return null;
}

export function usageAlertStorageKey(userId: string, periodKey: string, kind: UsageAlertKind): string {
  return `atelier.usage-alert:${userId}:${periodKey}:${kind}`;
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function isUsageAlertDismissed(key: string, storage: Pick<Storage, "getItem"> | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function dismissUsageAlert(key: string, storage: Pick<Storage, "setItem"> | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(key, "1");
  } catch {
    /* private mode */
  }
}

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
