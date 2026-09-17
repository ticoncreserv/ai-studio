import type { ProviderId, ProviderKeyState } from "@atelier/contracts";
import { emptyProviderKeyState, orderProviderKeys, providerKeyRef, providerKeySlot } from "@atelier/domain";
import { readProviderSecrets } from "../runtime/env-file.js";

export const PROVIDER_SECRET_KEYS: Record<Exclude<ProviderId, "mock">, string> = {
  cursor: "CURSOR_API_KEY",
  codex: "CODEX_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  grok: "XAI_API_KEY",
};

export const PROVIDER_SECRET_ALIASES: Partial<Record<ProviderId, string[]>> = {
  codex: ["OPENAI_API_KEY"],
  claude: ["CLAUDE_API_KEY"],
  gemini: ["GOOGLE_API_KEY"],
};

/** Highest slot an admin can add per provider. Keeps `providers.env` readable. */
export const PROVIDER_KEY_SLOTS = 8;

export function providerSecretKey(id: string): string {
  if (id in PROVIDER_SECRET_KEYS) return PROVIDER_SECRET_KEYS[id as Exclude<ProviderId, "mock">];
  return `${id.toUpperCase()}_API_KEY`;
}

/** Every env name that can hold a key for this provider, slot 1 first. */
export function providerKeyRefs(id: string): string[] {
  const secret = providerSecretKey(id);
  return Array.from({ length: PROVIDER_KEY_SLOTS }, (_, index) => providerKeyRef(secret, index + 1));
}

export function isProviderKeyRef(id: string, ref: string): boolean {
  const slot = providerKeySlot(providerSecretKey(id), ref);
  return slot >= 1 && slot <= PROVIDER_KEY_SLOTS;
}

function aliasRefs(id: string): string[] {
  return PROVIDER_SECRET_ALIASES[id as ProviderId] ?? [];
}

function readRef(ref: string, env: NodeJS.ProcessEnv, secrets: Record<string, string>): string | undefined {
  return env[ref]?.trim() || secrets[ref]?.trim() || undefined;
}

export type ProviderCredential = { ref: string; value: string };

/**
 * Stored keys for a provider in slot order. Slot 1 also accepts the vendor aliases
 * (`CLAUDE_API_KEY`, `GOOGLE_API_KEY`) so an existing `.env` keeps working.
 */
export function listProviderCredentials(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
): ProviderCredential[] {
  const secrets = readProviderSecrets(envRoot);
  const out: ProviderCredential[] = [];
  const seen = new Set<string>();
  for (const ref of providerKeyRefs(id)) {
    const candidates = ref === providerSecretKey(id) ? [ref, ...aliasRefs(id)] : [ref];
    for (const candidate of candidates) {
      const value = readRef(candidate, env, secrets);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push({ ref, value });
      break;
    }
  }
  return out;
}

/**
 * Keys to try for one prompt, in failover order. `keys` is the admin roster; refs it
 * does not mention are appended so a key added straight to `providers.env` still runs.
 */
export function providerCredentialCandidates(
  id: string,
  keys: ProviderKeyState[],
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
  now = new Date(),
): ProviderCredential[] {
  const stored = new Map(listProviderCredentials(id, env, envRoot).map((row) => [row.ref, row.value]));
  const ordered: ProviderCredential[] = [];
  for (const key of orderProviderKeys(keys, now)) {
    const value = stored.get(key.ref);
    if (value) ordered.push({ ref: key.ref, value });
  }
  const known = new Set(keys.map((key) => key.ref));
  for (const [ref, value] of stored) {
    if (!known.has(ref)) ordered.push({ ref, value });
  }
  return ordered;
}

export function readProviderCredential(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
): string | undefined {
  return listProviderCredentials(id, env, envRoot)[0]?.value;
}

export function hasProviderCredential(id: string, env: NodeJS.ProcessEnv = process.env, envRoot?: string): boolean {
  return listProviderCredentials(id, env, envRoot).length > 0;
}

/** Puts one chosen key under the provider's canonical env name and drops the rest. */
export function withProviderCredential(id: string, env: NodeJS.ProcessEnv, value: string): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const ref of [...providerKeyRefs(id), ...aliasRefs(id)]) delete next[ref];
  next[providerSecretKey(id)] = value;
  return next;
}

export function applyProviderCredential(
  id: string,
  env: NodeJS.ProcessEnv,
  envRoot?: string,
  override?: string,
): NodeJS.ProcessEnv {
  const value = override?.trim() || readProviderCredential(id, env, envRoot);
  if (!value) return { ...env };
  return withProviderCredential(id, env, value);
}

export function credentialKeepKeys(id: string): string[] {
  return [providerSecretKey(id), ...aliasRefs(id)];
}

/** Roster plus any secrets that were added outside the admin form. */
export function hydrateProviderKeys(
  id: string,
  roster: ProviderKeyState[],
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
): ProviderKeyState[] {
  const stored = listProviderCredentials(id, env, envRoot);
  const known = new Set(roster.map((key) => key.ref));
  const keys = roster.map((key) => ({ ...emptyProviderKeyState(key.ref, key.label), ...key }));
  for (const cred of stored) {
    if (!known.has(cred.ref)) keys.push(emptyProviderKeyState(cred.ref));
  }
  return keys;
}
