import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "@atelier/contracts";
import { DEFAULT_CURSOR_CLI_ACCOUNT_ID } from "@atelier/domain";
import { repoRoot } from "../paths.js";
import { hasProviderCredential } from "./credentials.js";
import { readProviderSecrets } from "../runtime/env-file.js";

export const ORIGIN_SESSION_ENV = [
  "CURSOR_AUTH_TOKEN",
  "CURSOR_CONVERSATION_ID",
  "CURSOR_REQUEST_ID",
  "CURSOR_AGENT",
  "CURSOR_AGENT_SOCKET",
] as const;

export const CURSOR_HOME_PROBE_ID = ".probe";

const PINNED_NVM_BIN = join(homedir(), ".nvm", "versions", "node", "v24.21.0", "bin");

export function cursorHomeRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ATELIER_CURSOR_HOME?.trim();
  if (override) return override;
  return join(repoRoot(), "var", "cursor-home");
}

export function cursorAccountHome(accountId: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(cursorHomeRoot(env), accountId);
}

export function cursorProbeHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(cursorHomeRoot(env), CURSOR_HOME_PROBE_ID);
}

export function hasCursorApiKey(env: NodeJS.ProcessEnv = process.env, envRoot?: string): boolean {
  return hasProviderCredential("cursor", env, envRoot);
}

export function preferredAgentProvider(env: NodeJS.ProcessEnv = process.env): ProviderId {
  if (hasCursorApiKey(env)) return "cursor";
  return env.VITEST ? "mock" : "cursor";
}

export function resolveSessionProvider(provider: string | undefined, env: NodeJS.ProcessEnv = process.env): ProviderId {
  const known = implementedProviders(env);
  if (provider && known.includes(provider as ProviderId)) return provider as ProviderId;
  return preferredAgentProvider(env);
}

export function implementedProviders(env: NodeJS.ProcessEnv = process.env): ProviderId[] {
  const ids: ProviderId[] = ["cursor", "codex", "claude", "gemini", "grok"];
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

export function cursorAgentEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { home?: string; apiKey?: string | false } = {},
): NodeJS.ProcessEnv {
  const secrets = readProviderSecrets();
  const next: NodeJS.ProcessEnv = { ...env };
  if (options.apiKey === false) {
    delete next.CURSOR_API_KEY;
  } else if (typeof options.apiKey === "string" && options.apiKey.trim()) {
    next.CURSOR_API_KEY = options.apiKey.trim();
  } else if (secrets.CURSOR_API_KEY?.trim()) {
    next.CURSOR_API_KEY = secrets.CURSOR_API_KEY;
  }
  for (const key of ORIGIN_SESSION_ENV) delete next[key];
  const prefixes = cursorAgentPathPrefixes(env);
  const rest = (next.PATH ?? "").split(":").filter((dir) => dir && !prefixes.includes(dir));
  next.PATH = [...prefixes, ...rest].join(":");
  const home = options.home?.trim() || cursorAccountHome(DEFAULT_CURSOR_CLI_ACCOUNT_ID, env);
  mkdirSync(home, { recursive: true });
  next.HOME = home;
  // Isolated HOMEs have no macOS login.keychain. Cursor's default store writes
  // the "cursor-user" item there and Security Agent shows "Keys Not Found".
  // File store keeps each account's token in $HOME/.cursor/auth.json instead.
  next.AGENT_CLI_CREDENTIAL_STORE = "file";
  return next;
}
