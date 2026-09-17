import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { parseSkillFile, skillFromParsed, type SkillDefinition, type SkillSource } from "@atelier/domain";

export interface SkillsManifest {
  written: Array<{ name: string; source: "platform" | "user"; path: string }>;
}

export function manifestPath(worktree: string): string {
  return join(worktree, "var", "atelier-skills.json");
}

export function readSkillsManifest(worktree: string): SkillsManifest {
  const file = manifestPath(worktree);
  if (!existsSync(file)) return { written: [] };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as SkillsManifest;
    return { written: Array.isArray(raw.written) ? raw.written : [] };
  } catch {
    return { written: [] };
  }
}

const SKIP = new Set(["node_modules", "vendor", "var", ".git", "dist", ".nuxt", "coverage", "public", "storage"]);
const SKILL_PARENTS = new Set([".agents", ".cursor", ".claude", ".codex"]);
const MAX_DEPTH = 8;

export function scanWorktreeSkills(worktree: string): SkillDefinition[] {
  if (!existsSync(worktree)) return [];
  const manifest = readSkillsManifest(worktree);
  const roots = findSkillRoots(worktree);
  const found: SkillDefinition[] = [];
  for (const root of roots) {
    for (const file of findSkillFiles(root.abs)) {
      const folder = basename(dirname(file));
      const dir = posixRel(worktree, dirname(file));
      const parsed = parseSkillFile(readFileSync(file, "utf8"));
      const source = sourceFor(dir, manifest);
      found.push(
        skillFromParsed({
          folder,
          dir,
          source,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
          scope: root.scope,
        }),
      );
    }
  }
  return found;
}

function sourceFor(dir: string, manifest: SkillsManifest): SkillSource {
  const written = manifest.written.find((row) => row.path === dir);
  return written?.source === "platform" || written?.source === "user" ? written.source : "repo";
}

function findSkillRoots(worktree: string): Array<{ abs: string; scope?: string }> {
  const roots: Array<{ abs: string; scope?: string }> = [];
  const visit = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || !existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (SKIP.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.name === "skills" && SKILL_PARENTS.has(basename(dir))) {
        const rel = posixRel(worktree, abs);
        const parentRel = posixRel(worktree, dirname(dir));
        roots.push({
          abs,
          scope: parentRel && parentRel !== "." ? parentRel : undefined,
        });
        void rel;
        continue;
      }
      visit(abs, depth + 1);
    }
  };
  visit(worktree, 0);
  return roots;
}

function findSkillFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 12 || !existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        visit(abs, depth + 1);
        continue;
      }
      if (entry.name === "SKILL.md") files.push(abs);
    }
  };
  visit(root, 0);
  return files;
}

function posixRel(from: string, to: string): string {
  return relative(from, to).split("\\").join("/");
}

export function worktreeHasFile(worktree: string, rel: string): boolean {
  try {
    return statSync(join(worktree, rel)).isFile();
  } catch {
    return false;
  }
}
