import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { knownDivergence, type AppliedMigration, type Divergence, type MigrationFile } from "@atelier/domain";

export function listBranchMigrations(worktree: string): MigrationFile[] {
  const dir = join(worktree, "database", "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".php"))
    .map((entry) => ({ name: entry.name.replace(/\.php$/, "") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function worktreeDivergence(worktree: string, applied: AppliedMigration[]): Divergence {
  return knownDivergence(listBranchMigrations(worktree), applied);
}
