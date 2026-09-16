import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionEvent } from "@atelier/contracts";
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
  const status = await git(worktree, ["status", "--porcelain"]).catch(() => "");
  const parts: string[] = [];
  for (const line of status.split("\n").filter(Boolean)) {
    const path = porcelainPath(line);
    if (!path || isStudioOnlyPath(path)) continue;
    const diff = await git(worktree, ["diff", "HEAD", "--", path]).catch(() => "");
    parts.push(line, diff);
  }
  return parts.join("\n");
}

export async function worktreeDiffEvents(worktree: string): Promise<SessionEvent[]> {
  const status = await git(worktree, ["status", "--porcelain"]).catch(() => "");
  if (!status.trim()) return [];
  const events: SessionEvent[] = [];
  for (const line of status.split("\n").filter(Boolean)) {
    const path = porcelainPath(line);
    if (!path || isStudioOnlyPath(path)) continue;
    const target = join(worktree, path);
    if (existsSync(target) && statSync(target).isDirectory()) continue;
    let contents = "";
    try {
      contents = existsSync(target) ? readFileSync(target, "utf8") : "";
    } catch {
      contents = "";
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
  const hunks = [];
  const blocks = diff.split(/^@@/m).slice(1);
  for (const block of blocks) {
    const header = block.split("\n")[0] ?? "";
    const match = header.match(/-(\d+)/);
    const plus = header.match(/\+(\d+)/);
    const body = block.split("\n").slice(1);
    hunks.push({
      id: randomUUID(),
      filePath,
      oldStart: Number(match?.[1] ?? 0),
      newStart: Number(plus?.[1] ?? 1),
      oldLines: body.filter((line) => line.startsWith("-")).map((line) => line.slice(1)).join("\n"),
      newLines: body.filter((line) => !line.startsWith("-") && !line.startsWith("\\")).map((line) => line.replace(/^\+/, "")).join("\n"),
      status: "pending" as const,
    });
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

export async function commitWorktree(
  worktree: string,
  user: { name: string; email: string },
  message: string,
): Promise<string | null> {
  await git(worktree, ["add", "-A"], user);
  await git(worktree, ["reset", "HEAD", "--", ".env", ".cursor", "var/uploads"], user).catch(() => undefined);
  const dirty = await git(worktree, ["status", "--porcelain"]);
  if (!dirty.trim()) return null;
  await git(worktree, ["commit", "-m", message], user);
  return git(worktree, ["rev-parse", "HEAD"]);
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
