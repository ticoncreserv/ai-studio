import type { UsageDecision, UsageLimits, UsageProfile, UsageSummary } from "@atelier/contracts";

export const DEFAULT_USAGE_PROFILE_ID = "standard";

/** One timezone decides every period boundary so a reset never lands mid-afternoon. */
export const DEFAULT_USAGE_TZ = "America/Sao_Paulo";

export interface UsageLedgerEntry {
  id: string;
  userId: string;
  workspaceId: string;
  sessionId: string;
  runId: string;
  provider: string;
  at: string;
  periodKey: string;
  dayKey: string;
  inputTokens: number;
  outputTokens: number;
  estimatedTokens: number;
  contextPeakTokens: number;
  costUsd: number;
  toolCalls: number;
  source: "estimated" | "provider" | "mixed";
}

export interface UsageRollup {
  userId: string;
  periodKey: string;
  tokens: number;
  costUsd: number;
  runs: number;
  lastRunAt: string;
}

export interface UsageGrant {
  id: string;
  userId: string;
  periodKey: string;
  tokens: number;
  reason: string;
  byUserId: string;
  at: string;
}

/**
 * Seeds leave `providers` empty on purpose: enabling a provider in `/admin` must
 * not start blocking prompts until someone deliberately restricts a profile.
 */
export function defaultUsageProfiles(): UsageProfile[] {
  return [
    {
      id: "starter",
      label: "Starter",
      limits: { monthlyTokens: 5_000_000 },
      enforcement: "block",
      warnAtPercent: 80,
      meter: "max",
      providers: [],
    },
    {
      id: DEFAULT_USAGE_PROFILE_ID,
      label: "Standard",
      limits: { monthlyTokens: 20_000_000 },
      enforcement: "block",
      warnAtPercent: 80,
      meter: "max",
      providers: [],
    },
    {
      id: "premium",
      label: "Premium",
      limits: { monthlyTokens: 60_000_000 },
      enforcement: "block",
      warnAtPercent: 80,
      meter: "max",
      providers: [],
    },
  ];
}

export function usageProfileIdFromLabel(label: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const root = base || "plan";
  if (!used.has(root)) return root;
  let n = 2;
  while (used.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function createUsageProfile(label: string, existing: UsageProfile[]): UsageProfile {
  const template =
    existing.find((row) => row.id === DEFAULT_USAGE_PROFILE_ID) ?? existing[0] ?? defaultUsageProfiles()[1]!;
  const trimmed = label.trim();
  return {
    id: usageProfileIdFromLabel(trimmed, existing.map((row) => row.id)),
    label: trimmed || template.label,
    limits: normalizeUsageLimits(template.limits),
    enforcement: template.enforcement,
    warnAtPercent: template.warnAtPercent,
    meter: template.meter,
    providers: [...template.providers],
  };
}

function zoneParts(at: Date, tz: string): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(at);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

export function usagePeriodKey(at: Date = new Date(), tz: string = DEFAULT_USAGE_TZ): string {
  const { year, month } = zoneParts(at, tz);
  return `${year}-${month}`;
}

export function usageDayKey(at: Date = new Date(), tz: string = DEFAULT_USAGE_TZ): string {
  const { year, month, day } = zoneParts(at, tz);
  return `${year}-${month}-${day}`;
}

export function normalizeUsageLimits(limits: { monthlyTokens?: number } | undefined): UsageLimits {
  const monthly = Number(limits?.monthlyTokens);
  return { monthlyTokens: Number.isFinite(monthly) && monthly > 0 ? Math.trunc(monthly) : 0 };
}

/** Drop leftover daily / per-run / cost caps from profiles saved before monthly-only limits. */
export function normalizeUsageProfile(row: UsageProfile): UsageProfile {
  return {
    ...row,
    limits: normalizeUsageLimits(row.limits),
    providers: [...(row.providers ?? [])],
  };
}

export function resolveUsageProfile(
  user: { usageProfileId?: string },
  profiles: UsageProfile[],
  fallbackId: string = DEFAULT_USAGE_PROFILE_ID,
): UsageProfile {
  const seeds = defaultUsageProfiles();
  const pool = (profiles.length ? profiles : seeds).map(normalizeUsageProfile);
  return (
    pool.find((row) => row.id === user.usageProfileId)
    ?? pool.find((row) => row.id === fallbackId)
    ?? pool[0]
    ?? seeds[1]!
  );
}

/** Provider-reported context peak and our own estimate measure different things; `meter` picks. */
export function billableTokens(
  entry: Pick<UsageLedgerEntry, "estimatedTokens" | "contextPeakTokens">,
  meter: UsageProfile["meter"],
): number {
  if (meter === "estimated") return entry.estimatedTokens;
  if (meter === "context_peak") return entry.contextPeakTokens;
  return Math.max(entry.estimatedTokens, entry.contextPeakTokens);
}

export interface UsageAggregate {
  periodTokens: number;
  periodCostUsd: number;
  runs: number;
  lastRunAt: string | null;
}

export function aggregateUsage(input: {
  entries: UsageLedgerEntry[];
  rollups: UsageRollup[];
  userId: string;
  periodKey: string;
  meter: UsageProfile["meter"];
}): UsageAggregate {
  const own = input.entries.filter((entry) => entry.userId === input.userId);
  const period = own.filter((entry) => entry.periodKey === input.periodKey);
  // Rollups cover periods whose raw entries were pruned; raw entries are the
  // truth for whatever is still on disk, so never add both for one period.
  const rollup = period.length
    ? null
    : input.rollups.find((row) => row.userId === input.userId && row.periodKey === input.periodKey) ?? null;
  const sum = (rows: UsageLedgerEntry[]) =>
    rows.reduce((total, entry) => total + billableTokens(entry, input.meter), 0);
  const lastRaw = period.map((entry) => entry.at).sort().at(-1) ?? null;
  return {
    periodTokens: rollup ? rollup.tokens : sum(period),
    periodCostUsd: rollup ? rollup.costUsd : period.reduce((total, entry) => total + entry.costUsd, 0),
    runs: rollup ? rollup.runs : period.length,
    lastRunAt: rollup ? rollup.lastRunAt : lastRaw,
  };
}

export function grantedTokens(grants: UsageGrant[], userId: string, periodKey: string): number {
  return grants
    .filter((grant) => grant.userId === userId && grant.periodKey === periodKey)
    .reduce((total, grant) => total + grant.tokens, 0);
}

export function evaluateUsage(input: {
  limits: UsageLimits;
  aggregate: UsageAggregate;
  grantedTokens: number;
  enforcement: UsageProfile["enforcement"];
  warnAtPercent: number;
  pendingTokens?: number;
  provider?: string;
  allowedProviders?: string[];
}): UsageDecision {
  const pending = Math.max(0, input.pendingTokens ?? 0);
  const allowed = input.allowedProviders ?? [];
  if (input.provider && allowed.length && !allowed.includes(input.provider)) {
    return { decision: "block", reason: "provider" };
  }
  const monthlyCap = input.limits.monthlyTokens > 0 ? input.limits.monthlyTokens + input.grantedTokens : 0;
  if (monthlyCap > 0 && input.aggregate.periodTokens + pending > monthlyCap) {
    return { decision: input.enforcement === "block" ? "block" : "warn", reason: "monthly" };
  }
  if (monthlyCap > 0) {
    const percent = ((input.aggregate.periodTokens + pending) / monthlyCap) * 100;
    if (percent >= input.warnAtPercent) return { decision: "warn", reason: "monthly" };
  }
  return { decision: "allow", reason: null };
}

export function summarizeUsage(input: {
  userId: string;
  profile: UsageProfile;
  entries: UsageLedgerEntry[];
  rollups: UsageRollup[];
  grants: UsageGrant[];
  at?: Date;
  tz?: string;
  pendingTokens?: number;
  provider?: string;
}): UsageSummary {
  const profile = normalizeUsageProfile(input.profile);
  const at = input.at ?? new Date();
  const tz = input.tz ?? DEFAULT_USAGE_TZ;
  const periodKey = usagePeriodKey(at, tz);
  const dayKey = usageDayKey(at, tz);
  const aggregate = aggregateUsage({
    entries: input.entries,
    rollups: input.rollups,
    userId: input.userId,
    periodKey,
    meter: profile.meter,
  });
  const granted = grantedTokens(input.grants, input.userId, periodKey);
  const monthlyCap = profile.limits.monthlyTokens > 0 ? profile.limits.monthlyTokens + granted : 0;
  const decision = evaluateUsage({
    limits: profile.limits,
    aggregate,
    grantedTokens: granted,
    enforcement: profile.enforcement,
    warnAtPercent: profile.warnAtPercent,
    pendingTokens: input.pendingTokens,
    provider: input.provider,
    allowedProviders: profile.providers,
  });
  return {
    userId: input.userId,
    profileId: profile.id,
    profileLabel: profile.label,
    enforcement: profile.enforcement,
    meter: profile.meter,
    warnAtPercent: profile.warnAtPercent,
    periodKey,
    dayKey,
    periodTokens: aggregate.periodTokens,
    grantedTokens: granted,
    runs: aggregate.runs,
    limits: profile.limits,
    limitTokens: monthlyCap,
    remainingTokens: monthlyCap > 0 ? Math.max(0, monthlyCap - aggregate.periodTokens) : 0,
    percentUsed: monthlyCap > 0 ? Math.min(100, Math.round((aggregate.periodTokens / monthlyCap) * 100)) : 0,
    unlimited: monthlyCap === 0,
    providers: profile.providers,
    decision,
    lastRunAt: aggregate.lastRunAt,
  };
}

export function rollupFromEntries(entries: UsageLedgerEntry[], meter: UsageProfile["meter"]): UsageRollup[] {
  const map = new Map<string, UsageRollup>();
  for (const entry of entries) {
    const key = `${entry.userId}:${entry.periodKey}`;
    const current = map.get(key) ?? {
      userId: entry.userId,
      periodKey: entry.periodKey,
      tokens: 0,
      costUsd: 0,
      runs: 0,
      lastRunAt: entry.at,
    };
    current.tokens += billableTokens(entry, meter);
    current.costUsd += entry.costUsd;
    current.runs += 1;
    if (entry.at > current.lastRunAt) current.lastRunAt = entry.at;
    map.set(key, current);
  }
  return [...map.values()];
}

export function mergeRollups(current: UsageRollup[], incoming: UsageRollup[]): UsageRollup[] {
  const map = new Map(current.map((row) => [`${row.userId}:${row.periodKey}`, row]));
  for (const row of incoming) {
    const key = `${row.userId}:${row.periodKey}`;
    const existing = map.get(key);
    map.set(
      key,
      existing
        ? {
            ...existing,
            tokens: existing.tokens + row.tokens,
            costUsd: existing.costUsd + row.costUsd,
            runs: existing.runs + row.runs,
            lastRunAt: row.lastRunAt > existing.lastRunAt ? row.lastRunAt : existing.lastRunAt,
          }
        : row,
    );
  }
  return [...map.values()];
}

export function usageRetentionDays(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.ATELIER_USAGE_RETENTION_DAYS ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 120;
}

export function usageTimezone(env: Record<string, string | undefined> = process.env): string {
  return env.ATELIER_USAGE_TZ?.trim() || DEFAULT_USAGE_TZ;
}

export function defaultUsageProfileId(env: Record<string, string | undefined> = process.env): string {
  return env.ATELIER_DEFAULT_USAGE_PROFILE?.trim() || DEFAULT_USAGE_PROFILE_ID;
}

/** Entries older than the retention window roll up; the rollup is what survives. */
export function splitExpiredEntries(
  entries: UsageLedgerEntry[],
  now: Date,
  retentionDays: number,
): { keep: UsageLedgerEntry[]; expired: UsageLedgerEntry[] } {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const keep: UsageLedgerEntry[] = [];
  const expired: UsageLedgerEntry[] = [];
  for (const entry of entries) {
    const at = new Date(entry.at).getTime();
    if (Number.isFinite(at) && at < cutoff) expired.push(entry);
    else keep.push(entry);
  }
  return { keep, expired };
}
