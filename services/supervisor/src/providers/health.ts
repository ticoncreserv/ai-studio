import { existsSync } from "node:fs";
import type { CursorCliAccount, FeatureFlag, ProviderHealth, ProviderId, ProviderKeyState, SandboxProfile } from "@atelier/contracts";
import { isCursorCliAccountUsable, isFlagOn, isProviderKeyUsable, resolveSandboxProfile } from "@atelier/domain";
import { hasProviderCredential, listProviderCredentials } from "./credentials.js";
import { PROVIDER_CATALOG } from "./types.js";
import { findBubblewrap, findDocker, resolveSandboxBackend } from "./sandbox.js";

function commandOnPath(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!command) return false;
  if (command.includes("/") || command.includes("\\")) return existsSync(command);
  return (env.PATH ?? "").split(":").some((dir) => existsSync(`${dir}/${command}`));
}

export function providerFlag(id: ProviderId): FeatureFlag | null {
  if (id === "claude") return "claudeProvider";
  if (id === "gemini") return "geminiProvider";
  if (id === "grok") return "grokProvider";
  if (id === "codex") return "codexProvider";
  return null;
}

export function inspectProviderHealth(
  id: ProviderId,
  flags: Record<string, boolean>,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
  keys?: ProviderKeyState[],
  cliAccounts?: CursorCliAccount[],
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
  const credentials = listProviderCredentials(id, env, envRoot);
  const hasKey = credentials.length > 0 || hasProviderCredential(id, env, envRoot);
  const hasCli = id === "cursor" && Boolean(cliAccounts?.some((account) => account.loggedIn));
  const hasCredential = hasKey || hasCli;
  const binary = capability.command === "npx" ? commandOnPath("npx", env) : commandOnPath(capability.command, env);
  if (!enabledFlag) {
    return { id, status: "disabled", binary, hasCredential, sandbox, message: "Provider flag is off" };
  }
  if (!hasCredential) {
    return {
      id,
      status: "unconfigured",
      binary,
      hasCredential,
      sandbox,
      message: id === "cursor" ? "Sign in a Cursor CLI account or add an API key" : "API key is not set",
    };
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
  const keyUsable =
    !credentials.length ||
    credentials.some((cred) => {
      const state = keys?.find((key) => key.ref === cred.ref);
      return !state || isProviderKeyUsable(state);
    });
  const cliUsable = Boolean(cliAccounts?.some((account) => isCursorCliAccountUsable(account)));
  const cliCooling = Boolean(cliAccounts?.some((account) => account.loggedIn && !isCursorCliAccountUsable(account)));
  if (id === "cursor") {
    if (cliUsable || (hasKey && keyUsable)) {
      return { id, status: "available", binary, hasCredential, sandbox };
    }
    if (cliCooling || hasKey) {
      return {
        id,
        status: "degraded",
        binary,
        hasCredential,
        sandbox,
        message: "All Cursor CLI accounts and API keys are cooling down or exhausted",
      };
    }
  } else if (keys?.length && credentials.length && !keyUsable) {
    return {
      id,
      status: "degraded",
      binary,
      hasCredential,
      sandbox,
      message: "All API keys are cooling down or exhausted",
    };
  }
  return { id, status: "available", binary, hasCredential, sandbox };
}

export function listProviderHealth(
  flags: Record<string, boolean>,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
  keysByProvider?: Record<string, ProviderKeyState[]>,
  cliAccounts?: CursorCliAccount[],
): ProviderHealth[] {
  return PROVIDER_CATALOG.filter((row) => row.id !== "mock" || env.VITEST).map((row) =>
    inspectProviderHealth(row.id, flags, env, envRoot, keysByProvider?.[row.id], row.id === "cursor" ? cliAccounts : undefined),
  );
}

export function isProviderSelectable(
  id: ProviderId,
  flags: Record<string, boolean>,
  env: NodeJS.ProcessEnv = process.env,
  envRoot?: string,
  keys?: ProviderKeyState[],
  cliAccounts?: CursorCliAccount[],
): boolean {
  if (id === "mock") return Boolean(env.VITEST);
  const health = inspectProviderHealth(id, flags, env, envRoot, keys, cliAccounts);
  return health.status === "available" || health.status === "degraded";
}

export function effectiveSandboxProfile(flags: Record<string, boolean>, env: NodeJS.ProcessEnv = process.env): SandboxProfile {
  return resolveSandboxProfile(flags, env);
}
