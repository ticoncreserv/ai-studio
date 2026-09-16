export interface MigrationFile {
  name: string;
}

export interface AppliedMigration {
  migration: string;
}

export interface Divergence {
  pendingInBranch: string[];
  extraInDatabase: string[];
}

export function diffMigrations(files: MigrationFile[], applied: AppliedMigration[]): Divergence {
  const fileNames = new Set(files.map((f) => f.name.replace(/\.php$/, "")));
  const appliedNames = new Set(applied.map((a) => a.migration));
  return {
    pendingInBranch: [...fileNames].filter((n) => !appliedNames.has(n)),
    extraInDatabase: [...appliedNames].filter((n) => !fileNames.has(n)),
  };
}

/** Unknown applied set is not divergence — do not invent pending migrations. */
export function knownDivergence(files: MigrationFile[], applied: AppliedMigration[]): Divergence {
  if (applied.length === 0) return { pendingInBranch: [], extraInDatabase: [] };
  return diffMigrations(files, applied);
}

export function mayMigrateForward(connectionKind: "app" | "erp", env: "homologation" | "production"): boolean {
  return connectionKind === "app" && env === "homologation";
}
