import { existsSync, lstatSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Hunk, SessionEvent } from "@atelier/contracts";
import { git } from "./git-ops.js";

function porcelainPath(line: string): string | undefined {
  return line
    .replace(/^[ MADRCU?!]{1,2}\s+/, "")
    .replace(/^"|"$/g, "")
    .split(" -> ")
    .pop();
}

function isStudioOnlyPath(path: string): boolean {
  return path.startsWith(".cursor/") || path.startsWith("var/") || path === ".env" || path === "var";
}

export async function worktreeFingerprint(worktree: string): Promise<string> {
  const tracked = await git(worktree, [
    "diff",
    "HEAD",
    "--binary",
    "--",
    ".",
    ":(exclude).cursor/**",
    ":(exclude)var/**",
    ":(exclude).env",
  ]).catch(() => "");
  const untracked = await git(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]).catch(() => "");
  const fingerprint = createHash("sha256").update(tracked);
  for (const path of untracked.split("\0").filter(Boolean).sort()) {
    if (isStudioOnlyPath(path)) continue;
    const target = join(worktree, path);
    const stat = lstatSync(target);
    if (stat.isDirectory()) continue;
    fingerprint.update("\0").update(path).update("\0");
    fingerprint.update(stat.isSymbolicLink() ? readlinkSync(target) : readFileSync(target));
  }
  return fingerprint.digest("hex");
}

export async function worktreeFileStates(worktree: string): Promise<Record<string, string>> {
  const status = await git(worktree, ["status", "--porcelain"]).catch(() => "");
  const states: Record<string, string> = {};
  for (const line of status.split("\n").filter(Boolean)) {
    const path = porcelainPath(line);
    if (!path || isStudioOnlyPath(path)) continue;
    const target = join(worktree, path);
    if (existsSync(target) && statSync(target).isDirectory()) continue;
    try {
      states[path] = existsSync(target) ? createHash("sha256").update(readFileSync(target)).digest("hex") : "deleted";
    } catch {
      states[path] = `unreadable:${line}`;
    }
  }
  return states;
}

export function changedWorktreePaths(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path]);
}

export async function worktreeDiffEvents(worktree: string, only?: string[]): Promise<SessionEvent[]> {
  const allowed = only ? new Set(only) : null;
  const status = await git(worktree, ["status", "--porcelain"]).catch(() => "");
  if (!status.trim()) return [];
  const events: SessionEvent[] = [];
  for (const line of status.split("\n").filter(Boolean)) {
    const path = porcelainPath(line);
    if (!path || isStudioOnlyPath(path)) continue;
    if (allowed && !allowed.has(path)) continue;
    const target = join(worktree, path);
    if (existsSync(target) && statSync(target).isDirectory()) continue;
    let contents = "";
    try {
      if (existsSync(target)) contents = readFileSync(target, "utf8");
    } catch {
      // keep an empty fallback when the worktree file cannot be read
    }
    const diff = (await git(worktree, ["diff", "HEAD", "--", path]).catch(() => "")) || contents;
    const hunks = splitHunks(path, diff);
    events.push({
      type: "diff",
      id: randomUUID(),
      at: new Date().toISOString(),
      filePath: path,
      hunks,
    });
  }
  return events;
}

export function splitHunks(filePath: string, diff: string) {
  if (!diff.trim()) {
    return [
      {
        id: randomUUID(),
        filePath,
        oldStart: 0,
        newStart: 1,
        oldLines: "",
        newLines: "",
        status: "pending" as const,
      },
    ];
  }
  const hunks: Hunk[] = [];
  const blocks = diff.split(/^@@/m).slice(1);
  for (const block of blocks) {
    const header = block.split("\n")[0] ?? "";
    const match = header.match(/-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?/);
    if (!match) continue;
    const body = block.split("\n").slice(1);
    let oldLine = Number(match[1]);
    let newLine = Number(match[2]);
    let oldStart = oldLine;
    let newStart = newLine;
    let oldLines: string[] = [];
    let newLines: string[] = [];
    const flush = () => {
      if (!oldLines.length && !newLines.length) return;
      hunks.push({
        id: randomUUID(),
        filePath,
        oldStart,
        newStart,
        oldLines: oldLines.join("\n"),
        newLines: newLines.join("\n"),
        status: "pending" as const,
      });
      oldLines = [];
      newLines = [];
    };
    for (const line of body) {
      if (line.startsWith("-")) {
        if (!oldLines.length && !newLines.length) {
          oldStart = oldLine;
          newStart = newLine;
        }
        oldLines.push(line.slice(1));
        oldLine += 1;
      } else if (line.startsWith("+")) {
        if (!oldLines.length && !newLines.length) {
          oldStart = oldLine;
          newStart = newLine;
        }
        newLines.push(line.slice(1));
        newLine += 1;
      } else if (line.startsWith(" ")) {
        flush();
        oldLine += 1;
        newLine += 1;
      }
    }
    flush();
  }
  return hunks.length
    ? hunks
    : [
        {
          id: randomUUID(),
          filePath,
          oldStart: 0,
          newStart: 1,
          oldLines: "",
          newLines: diff,
          status: "pending" as const,
        },
      ];
}

export async function restoreFile(worktree: string, filePath: string, rev = "HEAD"): Promise<void> {
  await git(worktree, ["checkout", rev, "--", filePath]).catch(async () => {
    await git(worktree, ["clean", "-f", "--", filePath]);
  });
}

export async function restoreProposalFiles(worktree: string, files: string[], rev: string): Promise<void> {
  for (const file of files) {
    await restoreFile(worktree, file, rev);
  }
}

export async function commitWorktree(
  worktree: string,
  user: { name: string; email: string },
  message: string,
  only?: string[],
): Promise<string | null> {
  if (only?.length) {
    await git(worktree, ["add", "--", ...only], user);
  } else {
    await git(worktree, ["add", "-A"], user);
    await git(worktree, ["reset", "HEAD", "--", ".env", ".cursor", "var/uploads"], user).catch(() => undefined);
  }
  const dirty = await git(worktree, ["status", "--porcelain"]);
  if (!dirty.trim()) return null;
  await git(worktree, ["commit", "-m", message], user);
  return git(worktree, ["rev-parse", "HEAD"]);
}

export async function currentHead(worktree: string): Promise<string> {
  return git(worktree, ["rev-parse", "HEAD"]);
}

export async function createProposalCommit(
  worktree: string,
  user: { name: string; email: string },
  message: string,
  only?: string[],
): Promise<{ baseSha: string; proposalSha: string; files: string[] } | null> {
  const baseSha = await currentHead(worktree);
  const scoped = only?.filter((path) => path && !isStudioOnlyPath(path));
  if (scoped && !scoped.length) return null;
  if (scoped?.length) {
    await git(worktree, ["add", "--", ...scoped], user);
  } else {
    await git(worktree, ["add", "-A"], user);
    await git(worktree, ["reset", "HEAD", "--", ".env", ".cursor", "var/uploads"], user).catch(() => undefined);
  }
  const dirty = await git(worktree, ["status", "--porcelain"]);
  const files = scoped?.length
    ? scoped
    : dirty
        .split("\n")
        .map((line) => porcelainPath(line))
        .filter((path): path is string => typeof path === "string" && !isStudioOnlyPath(path));
  if (!files.length) {
    await git(worktree, ["reset", "HEAD"], user).catch(() => undefined);
    return null;
  }
  const tree = await git(worktree, ["write-tree"], user);
  const headTree = await git(worktree, ["rev-parse", `${baseSha}^{tree}`], user).catch(() => "");
  if (tree === headTree) {
    await git(worktree, ["reset", "HEAD"], user).catch(() => undefined);
    return null;
  }
  const proposalSha = await git(worktree, ["commit-tree", tree, "-p", baseSha, "-m", message], user);
  await git(worktree, ["update-ref", `refs/atelier/proposals/${proposalSha.slice(0, 12)}`, proposalSha], user);
  await git(worktree, ["reset", "HEAD"], user).catch(() => undefined);
  return { baseSha, proposalSha, files };
}

function authedOrigin(origin: string, token?: string): string {
  if (token && origin.startsWith("https://github.com/")) {
    return origin.replace("https://github.com/", `https://x-access-token:${token}@github.com/`);
  }
  return origin;
}

export async function pushStudioBranch(
  worktree: string,
  user: { name: string; email: string },
  token?: string,
): Promise<{ status: "pushed" | "conflict" | "skipped" | "failed"; sha?: string; message: string; remote: string }> {
  const remotes = await git(worktree, ["remote"]).catch(() => "");
  if (!remotes.includes("origin")) {
    return { status: "skipped", message: "No origin remote is configured on this workspace.", remote: "origin" };
  }
  const origin = await git(worktree, ["remote", "get-url", "origin"]).catch(() => "origin");
  const sha = await currentHead(worktree).catch(() => "");
  const branch = (await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")).trim() || "HEAD";
  try {
    await git(worktree, ["push", authedOrigin(origin, token), `HEAD:refs/heads/${branch}`], user);
    return { status: "pushed", sha, message: `Pushed ${branch} ${sha.slice(0, 8)}`, remote: origin };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/non-fast-forward|rejected|fetch first/i.test(detail)) {
      return { status: "conflict", sha, message: `Remote ${branch} moved. Fetch and reconcile before pushing.`, remote: origin };
    }
    return { status: "failed", sha, message: detail, remote: origin };
  }
}

export async function syncBaseBranch(
  worktree: string,
  user: { name: string; email: string },
  token?: string,
): Promise<{ files: string[]; message: string }> {
  const remotes = await git(worktree, ["remote"]).catch(() => "");
  if (!remotes.includes("origin")) {
    return { files: [], message: "No origin remote is configured on this workspace." };
  }
  const origin = await git(worktree, ["remote", "get-url", "origin"]).catch(() => "origin");
  const fetchTarget =
    token && origin.startsWith("https://github.com/")
      ? origin.replace("https://github.com/", `https://x-access-token:${token}@github.com/`)
      : "origin";
  await git(worktree, ["fetch", fetchTarget], user);
  const head = await git(worktree, ["symbolic-ref", "refs/remotes/origin/HEAD"]).catch(() => "refs/remotes/origin/main");
  const base = head.replace("refs/remotes/origin/", "") || "main";
  try {
    await git(worktree, ["merge", "--no-edit", `origin/${base}`], user);
    return { files: [], message: `Merged origin/${base} without conflicts.` };
  } catch {
    const files = (await git(worktree, ["diff", "--name-only", "--diff-filter=U"]).catch(() => "")).split("\n").filter(Boolean);
    await git(worktree, ["merge", "--abort"], user).catch(() => undefined);
    return { files, message: `Conflicts while merging origin/${base}.` };
  }
}

export async function restoreCheckpoint(worktree: string, sha: string, user: { name: string; email: string }): Promise<void> {
  await git(worktree, ["reset", "--hard", sha], user);
}
