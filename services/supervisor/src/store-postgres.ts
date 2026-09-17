import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DbShape, PlatformStore } from "./store.js";
import { assembleDb, flattenDb, type StoreRows } from "./store-shape.js";

export class SnapshotStore implements PlatformStore {
  readonly kind = "postgres" as const;
  private rows: StoreRows | null = null;

  constructor(
    readonly path: string,
    private readonly base: () => DbShape,
  ) {}

  read(): DbShape {
    if (!this.rows && existsSync(this.path)) {
      this.rows = JSON.parse(readFileSync(this.path, "utf8")) as StoreRows;
    }
    if (!this.rows) return this.base();
    return assembleDb(this.rows, this.base());
  }

  write(db: DbShape): void {
    this.rows = flattenDb(db);
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.rows, null, 2));
  }

  update(mutator: (db: DbShape) => void): DbShape {
    const db = this.read();
    mutator(db);
    this.write(db);
    return db;
  }
}

export class ShadowStore implements PlatformStore {
  readonly kind = "shadow" as const;

  constructor(
    private readonly primary: PlatformStore,
    private readonly replica: PlatformStore,
  ) {}

  get path(): string {
    return this.primary.path;
  }

  read(): DbShape {
    return this.primary.read();
  }

  write(db: DbShape): void {
    this.primary.write(db);
    try {
      this.replica.write(db);
    } catch {
      // Replica is best-effort until postgres is the primary store.
    }
  }

  update(mutator: (db: DbShape) => void): DbShape {
    const db = this.primary.update(mutator);
    try {
      this.replica.write(db);
    } catch {
      // Replica is best-effort until postgres is the primary store.
    }
    return db;
  }
}

export function importJsonIntoStore(source: PlatformStore, target: PlatformStore): { records: number } {
  const db = source.read();
  target.write(db);
  const rows = flattenDb(db);
  return {
    records:
      rows.users.length +
      rows.workspaces.length +
      rows.sessions.length +
      rows.events.length +
      rows.invites.length,
  };
}
