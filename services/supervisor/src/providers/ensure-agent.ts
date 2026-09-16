import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CURSOR_AGENT_INSTALL_URL = "https://cursor.com/install";

export function cursorAgentHomeBin(home = homedir()): string {
  return join(home, ".local", "bin", "agent");
}

function searchHomes(env: NodeJS.ProcessEnv): string[] {
  if (env.ATELIER_AGENT_HOME?.trim()) return [env.ATELIER_AGENT_HOME.trim()];
  return [...new Set([homedir(), env.HOME?.trim() ?? ""].filter(Boolean))];
}

export function findCursorAgentBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const dirs = [...searchHomes(env).map((home) => join(home, ".local", "bin")), ...(env.PATH ?? "").split(":")];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const candidate = join(dir, "agent");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function installCursorAgentCli(
  run: () => Promise<void> = defaultInstallCursorAgentCli,
): Promise<void> {
  await run();
}

export async function defaultInstallCursorAgentCli(): Promise<void> {
  await execFileAsync("bash", ["-lc", `curl -fsSL ${CURSOR_AGENT_INSTALL_URL} | bash`], {
    timeout: 180_000,
    env: process.env,
  });
}

export async function ensureCursorAgent(input: {
  env?: NodeJS.ProcessEnv;
  install?: () => Promise<void>;
} = {}): Promise<string> {
  const env = input.env ?? process.env;
  const existing = findCursorAgentBinary(env);
  if (existing) return existing;
  if (env.VITEST) {
    throw new Error("Cursor agent CLI is not installed");
  }
  console.info("[atelier] installing Cursor agent CLI from", CURSOR_AGENT_INSTALL_URL);
  await installCursorAgentCli(input.install ?? defaultInstallCursorAgentCli);
  const next = findCursorAgentBinary(env);
  if (!next) {
    throw new Error(
      "Cursor agent CLI install finished but `agent` was not found. Prompts need ~/.local/bin/agent (curl https://cursor.com/install | bash).",
    );
  }
  return next;
}
