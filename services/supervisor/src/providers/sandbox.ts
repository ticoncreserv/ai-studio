import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STRIP_KEYS = [
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "SSH_AUTH_SOCK",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "NPM_TOKEN",
];

export function sanitizeAgentEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of STRIP_KEYS) delete next[key];
  next.GIT_TERMINAL_PROMPT = "0";
  next.ATELIER_AGENT_SANDBOX = "1";
  return next;
}

export function findBubblewrap(): string | null {
  const path = process.env.PATH ?? "";
  for (const dir of path.split(":")) {
    const candidate = join(dir, "bwrap");
    if (existsSync(candidate)) return candidate;
  }
  const fallback = join(homedir(), ".local", "bin", "bwrap");
  return existsSync(fallback) ? fallback : null;
}

export function sandboxCommand(
  command: string,
  args: string[],
  cwd: string,
  enabled: boolean,
): { command: string; args: string[] } {
  if (!enabled) return { command, args };
  const bwrap = findBubblewrap();
  if (!bwrap) return { command, args };
  return {
    command: bwrap,
    args: [
      "--unshare-pid",
      "--die-with-parent",
      "--bind",
      cwd,
      cwd,
      "--chdir",
      cwd,
      command,
      ...args,
    ],
  };
}
