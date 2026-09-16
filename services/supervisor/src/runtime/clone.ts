import { existsSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../paths.js";
import { git, gitOk, remoteLooksLikeRepo } from "./git-ops.js";

export interface CloneInput {
  worktree: string;
  branch: string;
  user: { name: string; email: string };
  repo?: string;
  token?: string;
  sourceDir?: string;
  force?: boolean;
}

export async function isForeignWorktree(worktree: string, repo: string): Promise<boolean> {
  if (!existsSync(join(worktree, ".git"))) return true;
  try {
    const url = await git(worktree, ["remote", "get-url", "origin"]);
    return !remoteLooksLikeRepo(url, repo);
  } catch {
    return true;
  }
}

export async function provisionWorktree(input: CloneInput): Promise<void> {
  const { worktree, branch, user } = input;
  if (input.force && existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
  if (existsSync(join(worktree, ".git")) && !input.force) {
    await git(worktree, ["checkout", "-B", branch], user).catch(() => undefined);
    return;
  }

  mkdirSync(worktree, { recursive: true });

  if (input.sourceDir) {
    await cloneFromSource(input);
    return;
  }
  if (input.token && input.repo) {
    await cloneFromGitHub(input);
    return;
  }
  throw new Error("GitHub App credentials are required to provision a workspace");
}

async function cloneFromGitHub(input: CloneInput): Promise<void> {
  const repo = input.repo!;
  const token = input.token!;
  const cache = join(repoRoot(), "var", "cache", `${repo.replace("/", "-")}.git`);
  const authed = `https://x-access-token:${token}@github.com/${repo}.git`;
  const publicUrl = `https://github.com/${repo}.git`;
  mkdirSync(join(repoRoot(), "var", "cache"), { recursive: true });
  if (!existsSync(cache)) {
    await git(repoRoot(), ["clone", "--bare", authed, cache], input.user);
  } else {
    await git(cache, ["fetch", authed, "+refs/heads/*:refs/heads/*"], input.user).catch(() => undefined);
  }
  await git(repoRoot(), ["clone", cache, input.worktree], input.user);
  await git(input.worktree, ["remote", "set-url", "origin", publicUrl], input.user);
  const head = await git(input.worktree, ["symbolic-ref", "refs/remotes/origin/HEAD"]).catch(() => "refs/remotes/origin/main");
  const defaultBranch = head.replace("refs/remotes/origin/", "") || "main";
  if (await gitOk(input.worktree, ["rev-parse", "--verify", `origin/${input.branch}`])) {
    await git(input.worktree, ["checkout", "-B", input.branch, `origin/${input.branch}`], input.user);
  } else {
    await git(input.worktree, ["checkout", "-B", input.branch, `origin/${defaultBranch}`], input.user);
    await git(input.worktree, ["push", authed, `HEAD:refs/heads/${input.branch}`], input.user).catch(() => undefined);
  }
}

async function cloneFromSource(input: CloneInput): Promise<void> {
  const source = input.sourceDir!;
  if (existsSync(join(source, ".git"))) {
    await git(source, ["clone", source, input.worktree], input.user);
  } else {
    cpSync(source, input.worktree, { recursive: true, dereference: false });
    if (!existsSync(join(input.worktree, ".git"))) {
      await git(input.worktree, ["init"], input.user);
      await git(input.worktree, ["add", "-A"], input.user);
      await git(input.worktree, ["commit", "-m", "chore: provision workspace", "--allow-empty"], input.user);
    }
  }
  await git(input.worktree, ["checkout", "-B", input.branch], input.user);
}
