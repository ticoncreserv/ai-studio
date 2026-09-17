import type { ProviderKeyFailure, ProviderKeyState } from "@atelier/contracts";

/** How long a key stays out of the rotation after a failure, per failure kind. */
export const PROVIDER_KEY_COOLDOWN_MS: Record<ProviderKeyFailure, number> = {
  auth: 60 * 60 * 1000,
  quota: 30 * 60 * 1000,
  rate_limit: 5 * 60 * 1000,
};

/** Consecutive failures that take a key out of the rotation until an admin resets it. */
export const PROVIDER_KEY_MAX_FAILURES = 5;

const AUTH_PATTERNS = [
  /\b401\b/,
  /\b403\b/,
  /unauthori[sz]ed/i,
  /forbidden/i,
  /authentication failed/i,
  /invalid[^.]{0,20}(api[ _-]?key|credential|token)/i,
  /(api[ _-]?key|credential|token)[^.]{0,30}(invalid|expired|revoked|missing|not set)/i,
  /permission[ _-]?denied/i,
];

const QUOTA_PATTERNS = [
  /\b402\b/,
  /quota/i,
  /insufficient[^.]{0,20}(credit|balance|fund)/i,
  /payment required/i,
  /billing/i,
  /spend limit/i,
];

const RATE_LIMIT_PATTERNS = [/\b429\b/, /rate[ _-]?limit/i, /too many requests/i, /overloaded/i];

/** Env key name for a key slot. Slot 1 keeps the historical single-key name. */
export function providerKeyRef(secretKey: string, slot: number): string {
  return slot <= 1 ? secretKey : `${secretKey}_${slot}`;
}

/** Slot number encoded in a ref, or `0` when the ref belongs to another secret. */
export function providerKeySlot(secretKey: string, ref: string): number {
  if (ref === secretKey) return 1;
  if (!ref.startsWith(`${secretKey}_`)) return 0;
  const slot = Number(ref.slice(secretKey.length + 1));
  return Number.isInteger(slot) && slot > 1 ? slot : 0;
}

/** Lowest free slot ref, so removing a key frees its name for the next one. */
export function nextProviderKeyRef(secretKey: string, taken: string[]): string {
  const used = new Set(taken);
  for (let slot = 1; ; slot += 1) {
    const ref = providerKeyRef(secretKey, slot);
    if (!used.has(ref)) return ref;
  }
}

export function emptyProviderKeyState(ref: string, label = ""): ProviderKeyState {
  return {
    ref,
    label,
    enabled: true,
    failures: 0,
    lastUsedAt: null,
    lastFailureAt: null,
    cooldownUntil: null,
    lastError: null,
    lastFailureKind: null,
  };
}

export function classifyProviderKeyFailure(message: string): ProviderKeyFailure | null {
  if (!message.trim()) return null;
  if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) return "rate_limit";
  if (QUOTA_PATTERNS.some((pattern) => pattern.test(message))) return "quota";
  if (AUTH_PATTERNS.some((pattern) => pattern.test(message))) return "auth";
  return null;
}

/** True when the message says the key is at fault, so another key is worth trying. */
export function isProviderKeyFailure(message: string): boolean {
  return classifyProviderKeyFailure(message) !== null;
}

export function isProviderKeyCoolingDown(key: ProviderKeyState, now = new Date()): boolean {
  if (!key.cooldownUntil) return false;
  const until = new Date(key.cooldownUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

export function isProviderKeyUsable(key: ProviderKeyState, now = new Date()): boolean {
  if (!key.enabled) return false;
  if (key.failures >= PROVIDER_KEY_MAX_FAILURES) return false;
  return !isProviderKeyCoolingDown(key, now);
}

/**
 * Failover order: the roster order an admin set, usable keys first. Keys that are
 * only cooling down stay at the end as a last resort — a stale cooldown must never
 * leave a provider with nothing to try.
 */
export function orderProviderKeys(keys: ProviderKeyState[], now = new Date()): ProviderKeyState[] {
  const usable = keys.filter((key) => isProviderKeyUsable(key, now));
  const cooling = keys.filter((key) => key.enabled && !isProviderKeyUsable(key, now));
  return [...usable, ...cooling];
}

export function markProviderKeyFailure(
  key: ProviderKeyState,
  input: { message: string; kind?: ProviderKeyFailure | null; now?: Date },
): ProviderKeyState {
  const now = input.now ?? new Date();
  const kind = input.kind ?? classifyProviderKeyFailure(input.message) ?? "auth";
  const failures = key.failures + 1;
  return {
    ...key,
    failures,
    lastFailureAt: now.toISOString(),
    lastError: input.message.slice(0, 300),
    lastFailureKind: kind,
    cooldownUntil: new Date(now.getTime() + PROVIDER_KEY_COOLDOWN_MS[kind]).toISOString(),
  };
}

export function markProviderKeySuccess(key: ProviderKeyState, now = new Date()): ProviderKeyState {
  return {
    ...key,
    failures: 0,
    lastUsedAt: now.toISOString(),
    cooldownUntil: null,
    lastError: null,
    lastFailureKind: null,
  };
}

export function resetProviderKey(key: ProviderKeyState): ProviderKeyState {
  return { ...key, failures: 0, cooldownUntil: null, lastError: null, lastFailureKind: null };
}

export function moveProviderKey(keys: ProviderKeyState[], ref: string, direction: "up" | "down"): ProviderKeyState[] {
  const index = keys.findIndex((key) => key.ref === ref);
  if (index < 0) return keys;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= keys.length) return keys;
  const next = [...keys];
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row!);
  return next;
}
