import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArtisanRouteList, type MentionIndex } from "@atelier/domain";

const execFileAsync = promisify(execFile);

export async function worktreeBytes(worktree: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("du", ["-sb", worktree], { timeout: 30_000 });
    const bytes = Number(stdout.trim().split(/\s+/)[0] || 0);
    if (Number.isFinite(bytes) && bytes > 0) return bytes;
  } catch {
    // GNU `du -sb` is the fast path; BSD/macOS `du` rejects `-b`.
  }
  try {
    return directorySizeFallback(worktree);
  } catch {
    return 0;
  }
}

export function listModels(worktree: string): string[] {
  const dir = join(worktree, "app", "Models");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".php"))
    .map((name) => name.replace(/\.php$/, ""))
    .sort();
}

export function listPages(worktree: string, root = join(worktree, "resources", "js", "Pages")): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (/\.vue$/.test(entry.name)) out.push(`${prefix}${entry.name.replace(/\.vue$/, "")}`);
    }
  };
  walk(root, "");
  return out.sort();
}

export async function listRoutes(worktree: string): Promise<string[]> {
  if (!existsSync(join(worktree, "artisan"))) return [];
  try {
    const { stdout } = await execFileAsync("php", ["artisan", "route:list", "--json"], {
      cwd: worktree,
      timeout: 20_000,
    });
    return parseArtisanRouteList(JSON.parse(stdout));
  } catch {
    return [];
  }
}

export async function mentionIndexFromWorktree(worktree: string): Promise<MentionIndex> {
  const [routes] = await Promise.all([listRoutes(worktree)]);
  return {
    routes: routes.length ? routes : [],
    models: listModels(worktree),
    pages: listPages(worktree),
  };
}

export function directorySizeFallback(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const walk = (path: string) => {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) walk(join(path, name));
    } else {
      total += stat.size;
    }
  };
  walk(dir);
  return total;
}
