import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@atelier/contracts";

const STRIP_KEYS = [
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SESSION_TOKEN",
  "SSH_AUTH_SOCK",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "NPM_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "XAI_API_KEY",
  "CURSOR_API_KEY",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
];

export function sanitizeAgentEnv(env: NodeJS.ProcessEnv, keep: string[] = []): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of STRIP_KEYS) {
    if (!keep.includes(key)) delete next[key];
  }
  next.GIT_TERMINAL_PROMPT = "0";
  next.ATELIER_AGENT_SANDBOX = "1";
  return next;
}

export function findBubblewrap(env: NodeJS.ProcessEnv = process.env): string | null {
  const path = env.PATH ?? process.env.PATH ?? "";
  for (const dir of path.split(":")) {
    const candidate = join(dir, "bwrap");
    if (existsSync(candidate)) return candidate;
  }
  const fallback = join(homedir(), ".local", "bin", "bwrap");
  return existsSync(fallback) ? fallback : null;
}

export function findDocker(env: NodeJS.ProcessEnv = process.env): string | null {
  const path = env.PATH ?? process.env.PATH ?? "";
  for (const dir of path.split(":")) {
    const candidate = join(dir, "docker");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export type SandboxBackend = "bwrap" | "docker";

export function resolveSandboxBackend(env: NodeJS.ProcessEnv = process.env): SandboxBackend | null {
  const forced = env.ATELIER_SANDBOX_BACKEND?.trim();
  if (forced === "bwrap" || forced === "docker") {
    if (forced === "bwrap") return findBubblewrap(env) ? "bwrap" : null;
    return findDocker(env) ? "docker" : null;
  }
  if (findBubblewrap(env)) return "bwrap";
  if (findDocker(env) && env.ATELIER_SANDBOX_IMAGE?.trim()) return "docker";
  return null;
}

export function sandboxCommand(
  command: string,
  args: string[],
  cwd: string,
  enabled: boolean,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  if (!enabled) return { command, args };
  return wrapSandbox(command, args, cwd, "best-effort", env);
}

export function wrapSandbox(
  command: string,
  args: string[],
  cwd: string,
  profile: SandboxProfile,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[]; backend: SandboxBackend | null } {
  if (profile === "disabled") return { command, args, backend: null };
  const backend = resolveSandboxBackend(env);
  if (!backend) {
    if (profile === "required") {
      throw new Error("Sandbox is required but neither bubblewrap nor a sandbox image is available");
    }
    return { command, args, backend: null };
  }
  if (backend === "bwrap") {
    const bwrap = findBubblewrap(env);
    if (!bwrap) {
      if (profile === "required") throw new Error("Sandbox is required but bubblewrap is not installed");
      return { command, args, backend: null };
    }
    const binds = sandboxBindPaths(cwd, env);
    const bindArgs = binds.flatMap((path) => ["--bind", path, path]);
    return {
      command: bwrap,
      args: [
        "--unshare-pid",
        "--die-with-parent",
        ...bindArgs,
        "--chdir",
        cwd,
        command,
        ...args,
      ],
      backend,
    };
  }
  const docker = findDocker(env);
  const image = env.ATELIER_SANDBOX_IMAGE?.trim();
  if (!docker || !image) {
    if (profile === "required") throw new Error("Sandbox is required but docker/image is not available");
    return { command, args, backend: null };
  }
  return {
    command: docker,
    args: [
      "run",
      "--rm",
      "-i",
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--network",
      env.ATELIER_SANDBOX_NETWORK?.trim() || "none",
      "--user",
      "65534:65534",
      ...sandboxBindPaths(cwd, env).flatMap((path) => ["--mount", `type=bind,src=${path},dst=${path}`]),
      "--workdir",
      cwd,
      image,
      command,
      ...args,
    ],
    backend,
  };
}

function sandboxBindPaths(cwd: string, env: NodeJS.ProcessEnv): string[] {
  const paths = [cwd];
  const home = env.HOME?.trim();
  if (home && home !== cwd) paths.push(home);
  return paths;
}
