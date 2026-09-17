import type { ProviderId } from "@atelier/contracts";
import { readProviderSecrets } from "../runtime/env-file.js";

export const PROVIDER_SECRET_KEYS: Record<Exclude<ProviderId, "mock">, string> = {
  cursor: "CURSOR_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  grok: "XAI_API_KEY",
};

export const PROVIDER_SECRET_ALIASES: Partial<Record<ProviderId, string[]>> = {
  claude: ["CLAUDE_API_KEY"],
  gemini: ["GOOGLE_API_KEY"],
};

export function providerSecretKey(id: string): string {
  if (id === "cursor" || id === "claude" || id === "gemini" || id === "grok") {
    return PROVIDER_SECRET_KEYS[id];
  }
  return `${id.toUpperCase()}_API_KEY`;
}

export function readProviderCredential(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
): string | undefined {
  const keys = [providerSecretKey(id), ...(PROVIDER_SECRET_ALIASES[id as ProviderId] ?? [])];
  const secrets = readProviderSecrets(envRoot);
  for (const key of keys) {
    const value = env[key]?.trim() || secrets[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function hasProviderCredential(id: string, env: NodeJS.ProcessEnv = process.env, envRoot?: string): boolean {
  return Boolean(readProviderCredential(id, env, envRoot));
}

export function applyProviderCredential(
  id: string,
  env: NodeJS.ProcessEnv,
  envRoot?: string,
): NodeJS.ProcessEnv {
  const next = { ...env };
  const value = readProviderCredential(id, env, envRoot);
  if (value) next[providerSecretKey(id)] = value;
  return next;
}

export function credentialKeepKeys(id: string): string[] {
  return [providerSecretKey(id), ...(PROVIDER_SECRET_ALIASES[id as ProviderId] ?? [])];
}
