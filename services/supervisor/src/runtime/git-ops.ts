import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function gitEnv(user: { name: string; email: string }): string[] {
  return ["-c", `user.name=${user.name}`, "-c", `user.email=${user.email}`, "-c", "commit.gpgsign=false"];
}

export async function git(
  cwd: string,
  args: string[],
  user?: { name: string; email: string },
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  const prefix = user ? gitEnv(user) : [];
  const { stdout } = await execFileAsync("git", [...prefix, ...args], {
    cwd,
    env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 120_000,
  });
  return stdout.trim();
}

export async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

export function remoteLooksLikeRepo(url: string, repo: string): boolean {
  return url.replace(/\.git$/, "").endsWith(repo);
}
