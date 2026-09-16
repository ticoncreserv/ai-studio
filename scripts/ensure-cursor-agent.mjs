#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const INSTALL_URL = "https://cursor.com/install";

export function findCursorAgentBinary(env = process.env) {
  const homes = env.ATELIER_AGENT_HOME ? [env.ATELIER_AGENT_HOME] : [...new Set([homedir(), env.HOME].filter(Boolean))];
  const dirs = [...homes.map((home) => join(home, ".local", "bin")), ...(env.PATH ?? "").split(":")];
  const seen = new Set();
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const candidate = join(dir, "agent");
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

export function ensureCursorAgentCli(env = process.env) {
  const existing = findCursorAgentBinary(env);
  if (existing) {
    console.info(`[atelier] cursor agent CLI ready: ${existing}`);
    return existing;
  }
  if (env.VITEST) {
    throw new Error("Cursor agent CLI is not installed");
  }
  console.info(`[atelier] installing Cursor agent CLI from ${INSTALL_URL}`);
  const result = spawnSync("bash", ["-lc", `curl -fsSL ${INSTALL_URL} | bash`], {
    stdio: "inherit",
    env,
  });
  const next = findCursorAgentBinary(env);
  if (result.status !== 0 || !next) {
    throw new Error(
      "Cursor agent CLI install finished but `agent` was not found. Prompts need ~/.local/bin/agent.",
    );
  }
  console.info(`[atelier] cursor agent CLI ready: ${next}`);
  return next;
}

if (process.argv[1]?.endsWith("ensure-cursor-agent.mjs")) {
  try {
    ensureCursorAgentCli();
  } catch (error) {
    console.error("[atelier]", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
