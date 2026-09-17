import { dirname, join } from "node:path";
import { repoRoot } from "./paths.js";
import { JsonStore, type PlatformStore } from "./store.js";
import { ShadowStore, SnapshotStore } from "./store-postgres.js";

export function createPlatformStore(jsonPath = join(repoRoot(), "var", "platform.json")): PlatformStore {
  const json = new JsonStore(jsonPath);
  const flags = json.read().flags;
  const mode = (process.env.ATELIER_STORE ?? "").trim() || (flags.postgresStore ? "postgres" : flags.postgresShadowRead ? "shadow" : "json");
  if (mode === "json") return json;
  const snapshot = new SnapshotStore(join(dirname(jsonPath), "platform.pg.json"), () => json.read());
  if (process.env.DATABASE_URL?.trim() && mode === "postgres") {
    // Live SQL connection is provisioned later; the snapshot store keeps the
    // contract and import path working until that host exists.
    return snapshot;
  }
  if (mode === "shadow" || flags.postgresShadowRead) return new ShadowStore(json, snapshot);
  if (mode === "postgres") return snapshot;
  return json;
}
