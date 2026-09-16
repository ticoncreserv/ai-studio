import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { repoRoot } from "../paths.js";

const SNAPSHOT_DIRS = ["vendor", "node_modules"] as const;
const LOCK_FILES = ["composer.lock", "package-lock.json", "pnpm-lock.yaml", "composer.json", "package.json"];

export function dependencyCacheRoot(root = repoRoot()): string {
  return join(root, "var", "cache", "deps");
}

export function dependencyFingerprint(worktree: string): string {
  const hash = createHash("sha256");
  for (const file of LOCK_FILES) {
    const path = join(worktree, file);
    hash.update(file);
    hash.update(existsSync(path) ? readFileSync(path) : Buffer.alloc(0));
  }
  return hash.digest("hex").slice(0, 16);
}

function snapshotDir(worktree: string, root?: string): string {
  return join(dependencyCacheRoot(root), dependencyFingerprint(worktree));
}

function cloneDir(source: string, dest: string): void {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, ".."), { recursive: true });
  try {
    execFileSync("cp", ["-a", "--reflink=auto", source, dest], { stdio: "ignore" });
    return;
  } catch {
    /* fall through */
  }
  try {
    execFileSync("cp", ["-al", source, dest], { stdio: "ignore" });
    return;
  } catch {
    cpSync(source, dest, { recursive: true, dereference: false });
  }
}

export function hydrateDependencySnapshots(worktree: string, root?: string): void {
  const cache = snapshotDir(worktree, root);
  for (const dir of SNAPSHOT_DIRS) {
    const source = join(cache, dir);
    const dest = join(worktree, dir);
    if (existsSync(source) && !existsSync(dest)) cloneDir(source, dest);
  }
}

export function persistDependencySnapshots(worktree: string, root?: string): void {
  const cache = snapshotDir(worktree, root);
  for (const dir of SNAPSHOT_DIRS) {
    const source = join(worktree, dir);
    const dest = join(cache, dir);
    if (!existsSync(source) || existsSync(dest)) continue;
    mkdirSync(cache, { recursive: true });
    cloneDir(source, dest);
  }
}
