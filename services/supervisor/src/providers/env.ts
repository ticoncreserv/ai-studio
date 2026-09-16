import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "@atelier/contracts";
import { repoRoot } from "../paths.js";

export const ORIGIN_SESSION_ENV = [
  "CURSOR_AUTH_TOKEN",
  "CURSOR_CONVERSATION_ID",
  "CURSOR_REQUEST_ID",
  "CURSOR_AGENT",
  "CURSOR_AGENT_SOCKET",
] as const;

export function hasCursorApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CURSOR_API_KEY?.trim());
}

export function preferredAgentProvider(env: NodeJS.ProcessEnv = process.env): ProviderId {
  return hasCursorApiKey(env) ? "cursor" : "mock";
}

export function resolveSessionProvider(provider: string | undefined, env: NodeJS.ProcessEnv = process.env): ProviderId {
  if (provider === "cursor" || provider === "claude" || provider === "gemini" || provider === "grok") return provider;
  if (provider === "mock" && env.VITEST) return "mock";
  return preferredAgentProvider(env);
}

export function cursorAgentEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of ORIGIN_SESSION_ENV) delete next[key];
  const localBin = join(homedir(), ".local", "bin");
  const path = next.PATH ?? "";
  if (!path.split(":").includes(localBin)) next.PATH = `${localBin}${path ? `:${path}` : ""}`;
  const home = join(repoRoot(), "var", "cursor-home");
  mkdirSync(home, { recursive: true });
  next.HOME = home;
  return next;
}
