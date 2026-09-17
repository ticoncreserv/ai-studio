import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "@atelier/contracts";
import { repoRoot } from "../paths.js";
import { readProviderSecrets } from "../runtime/env-file.js";

export const ORIGIN_SESSION_ENV = [
  "CURSOR_AUTH_TOKEN",
  "CURSOR_CONVERSATION_ID",
  "CURSOR_REQUEST_ID",
  "CURSOR_AGENT",
  "CURSOR_AGENT_SOCKET",
] as const;

const PINNED_NVM_BIN = join(homedir(), ".nvm", "versions", "node", "v24.21.0", "bin");

export function hasCursorApiKey(env: NodeJS.ProcessEnv = process.env, envRoot?: string): boolean {
  return Boolean(env.CURSOR_API_KEY?.trim() || readProviderSecrets(envRoot).CURSOR_API_KEY?.trim());
}

export function preferredAgentProvider(env: NodeJS.ProcessEnv = process.env): ProviderId {
  if (hasCursorApiKey(env)) return "cursor";
  return env.VITEST ? "mock" : "cursor";
}

export function resolveSessionProvider(provider: string | undefined, env: NodeJS.ProcessEnv = process.env): ProviderId {
  if (provider === "cursor" || provider === "claude" || provider === "gemini" || provider === "grok") return provider;
  if (provider === "mock" && env.VITEST) return "mock";
  return preferredAgentProvider(env);
}

export function implementedProviders(env: NodeJS.ProcessEnv = process.env): ProviderId[] {
  const ids: ProviderId[] = ["cursor", "claude", "gemini", "grok"];
  if (env.VITEST) ids.push("mock");
  return ids;
}

export function cursorAgentPathPrefixes(env: NodeJS.ProcessEnv = process.env): string[] {
  const nvmBin = env.NVM_BIN?.trim() || PINNED_NVM_BIN;
  return [nvmBin, join(homedir(), ".local", "bin")];
}

export function resolveCursorAgentCommand(env: NodeJS.ProcessEnv): string {
  for (const dir of (env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "agent");
    if (existsSync(candidate)) return candidate;
  }
  return "agent";
}

export function cursorAgentEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const secrets = readProviderSecrets();
  const next: NodeJS.ProcessEnv = { ...env };
  if (secrets.CURSOR_API_KEY?.trim()) next.CURSOR_API_KEY = secrets.CURSOR_API_KEY;
  for (const key of ORIGIN_SESSION_ENV) delete next[key];
  const prefixes = cursorAgentPathPrefixes(env);
  const rest = (next.PATH ?? "").split(":").filter((dir) => dir && !prefixes.includes(dir));
  next.PATH = [...prefixes, ...rest].join(":");
  const home = join(repoRoot(), "var", "cursor-home");
  mkdirSync(home, { recursive: true });
  next.HOME = home;
  return next;
}
