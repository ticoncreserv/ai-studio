import { existsSync } from "node:fs";
import type { FeatureFlag, ProviderHealth, ProviderId, SandboxProfile } from "@atelier/contracts";
import { isFlagOn, resolveSandboxProfile } from "@atelier/domain";
import { hasProviderCredential } from "./credentials.js";
import { PROVIDER_CATALOG } from "./types.js";
import { findBubblewrap, findDocker, resolveSandboxBackend } from "./sandbox.js";
import { hasCursorApiKey } from "./env.js";

function commandOnPath(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!command) return false;
  if (command.includes("/") || command.includes("\\")) return existsSync(command);
  return (env.PATH ?? "").split(":").some((dir) => existsSync(`${dir}/${command}`));
}

export function providerFlag(id: ProviderId): FeatureFlag | null {
  if (id === "claude") return "claudeProvider";
  if (id === "gemini") return "geminiProvider";
  if (id === "grok") return "grokProvider";
  return null;
}

export function inspectProviderHealth(
  id: ProviderId,
  flags: Record<string, boolean>,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
): ProviderHealth {
  const capability = PROVIDER_CATALOG.find((row) => row.id === id);
  const sandbox = resolveSandboxProfile(flags, env);
  if (!capability) {
    return { id, status: "unavailable", binary: false, hasCredential: false, sandbox };
  }
  if (id === "mock") {
    const available = Boolean(env.VITEST);
    return {
      id,
      status: available ? "available" : "unavailable",
      binary: available,
      hasCredential: available,
      sandbox,
      message: available ? undefined : "MockProvider is only available in tests",
    };
  }
  const flag = providerFlag(id);
  const enabledFlag = id === "cursor" || (isFlagOn(flags, "multiProvider") && (!flag || isFlagOn(flags, flag)));
  const hasCredential = id === "cursor" ? hasCursorApiKey(env, envRoot) : hasProviderCredential(id, env, envRoot);
  const binary = id === "claude" ? commandOnPath("npx", env) : commandOnPath(capability.command, env);
  if (!enabledFlag) {
    return { id, status: "disabled", binary, hasCredential, sandbox, message: "Provider flag is off" };
  }
  if (!hasCredential) {
    return { id, status: "unconfigured", binary, hasCredential, sandbox, message: "API key is not set" };
  }
  if (!binary) {
    return { id, status: "unavailable", binary, hasCredential, sandbox, message: `${capability.command} is not on PATH` };
  }
  if (sandbox === "required" && !resolveSandboxBackend(env) && !findBubblewrap(env) && !findDocker(env)) {
    return {
      id,
      status: "degraded",
      binary,
      hasCredential,
      sandbox,
      message: "Sandbox is required but no backend is available",
    };
  }
  return { id, status: "available", binary, hasCredential, sandbox };
}

export function listProviderHealth(
  flags: Record<string, boolean>,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
): ProviderHealth[] {
  return PROVIDER_CATALOG.filter((row) => row.id !== "mock" || env.VITEST).map((row) =>
    inspectProviderHealth(row.id, flags, env, envRoot),
  );
}

export function isProviderSelectable(
  id: ProviderId,
  flags: Record<string, boolean>,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
): boolean {
  if (id === "mock") return Boolean(env.VITEST);
  const health = inspectProviderHealth(id, flags, env, envRoot);
  return health.status === "available" || health.status === "degraded";
}

export function effectiveSandboxProfile(flags: Record<string, boolean>, env: NodeJS.ProcessEnv = process.env): SandboxProfile {
  return resolveSandboxProfile(flags, env);
}
