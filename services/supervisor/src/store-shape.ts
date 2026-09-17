import type { ProviderKeyState, ProviderModel, SessionEvent } from "@atelier/contracts";
import type { DbShape, ProviderConfig, SessionRecord } from "./store.js";

export interface StoreRows {
  users: DbShape["users"];
  workspaces: DbShape["workspaces"];
  sessions: Array<Omit<SessionRecord, "events"> & { eventCount: number }>;
  events: Array<{ sessionId: string; seq: number; event: SessionEvent }>;
  invites: DbShape["invites"];
  shares: DbShape["shares"];
  connections: DbShape["connections"];
  recipes: DbShape["recipes"];
  rules: DbShape["rules"];
  members: DbShape["members"];
  flags: Array<{ key: string; enabled: boolean }>;
  providers: Array<{
    id: string;
    enabled: boolean;
    model: string;
    keys: ProviderKeyState[];
    models: ProviderModel[];
  }>;
  presence: DbShape["presence"];
  leases: Array<{ workspaceId: string; sessionId: string; userId: string; leaseUntil?: string; heartbeatAt?: string }>;
  migrationLog: DbShape["migrationLog"];
  skillPrefs: DbShape["skillPrefs"];
  mcpPrefs: DbShape["mcpPrefs"];
  usageProfiles: DbShape["usageProfiles"];
  usageLedger: DbShape["usageLedger"];
  usageRollups: DbShape["usageRollups"];
  usageGrants: DbShape["usageGrants"];
}

export function flattenDb(db: DbShape): StoreRows {
  const events: StoreRows["events"] = [];
  const sessions = db.sessions.map((session) => {
    session.events.forEach((event, seq) => events.push({ sessionId: session.id, seq, event }));
    const { events: _events, ...rest } = session;
    return { ...rest, eventCount: session.events.length };
  });
  return {
    users: db.users,
    workspaces: db.workspaces,
    sessions,
    events,
    invites: db.invites,
    shares: db.shares,
    connections: db.connections,
    recipes: db.recipes,
    rules: db.rules,
    members: db.members,
    flags: Object.entries(db.flags).map(([key, enabled]) => ({ key, enabled })),
    providers: Object.entries(db.providers).map(([id, row]) => ({
      id,
      enabled: row.enabled,
      model: row.model ?? "",
      keys: row.keys ?? [],
      models: row.models ?? [],
    })),
    presence: db.presence,
    leases: Object.entries(db.runLock)
      .filter((entry): entry is [string, NonNullable<(typeof db.runLock)[string]>] => Boolean(entry[1]))
      .map(([workspaceId, lease]) => ({ workspaceId, ...lease })),
    migrationLog: db.migrationLog,
    skillPrefs: db.skillPrefs,
    mcpPrefs: db.mcpPrefs,
    usageProfiles: db.usageProfiles,
    usageLedger: db.usageLedger,
    usageRollups: db.usageRollups,
    usageGrants: db.usageGrants,
  };
}

export function assembleDb(rows: StoreRows, base: DbShape): DbShape {
  const eventsBySession = new Map<string, SessionEvent[]>();
  const sorted = [...rows.events].sort((a, b) => a.seq - b.seq);
  for (const row of sorted) {
    const list = eventsBySession.get(row.sessionId) ?? [];
    list.push(row.event);
    eventsBySession.set(row.sessionId, list);
  }
  return {
    ...base,
    users: rows.users,
    workspaces: rows.workspaces,
    sessions: rows.sessions.map((session) => {
      const { eventCount: _count, ...rest } = session;
      return { ...rest, events: eventsBySession.get(session.id) ?? [] };
    }),
    invites: rows.invites,
    shares: rows.shares,
    connections: rows.connections,
    recipes: rows.recipes.length ? rows.recipes : base.recipes,
    rules: rows.rules.length ? rows.rules : base.rules,
    members: rows.members,
    flags: { ...base.flags, ...Object.fromEntries(rows.flags.map((row) => [row.key, row.enabled])) },
    providers: {
      ...base.providers,
      ...Object.fromEntries(
        rows.providers.map((row) => {
          const next: ProviderConfig = { enabled: row.enabled };
          if (row.model) next.model = row.model;
          if (row.keys?.length) next.keys = row.keys;
          if (row.models?.length) next.models = row.models;
          return [row.id, next];
        }),
      ),
    },
    presence: rows.presence,
    runLock: Object.fromEntries(rows.leases.map(({ workspaceId, ...lease }) => [workspaceId, lease])),
    migrationLog: rows.migrationLog,
    skillPrefs: rows.skillPrefs,
    mcpPrefs: rows.mcpPrefs,
    usageProfiles: rows.usageProfiles.length ? rows.usageProfiles : base.usageProfiles,
    usageLedger: rows.usageLedger,
    usageRollups: rows.usageRollups,
    usageGrants: rows.usageGrants,
  };
}

export function compareStoreShapes(left: DbShape, right: DbShape): string[] {
  const mismatches: string[] = [];
  const keys: Array<keyof DbShape> = [
    "users",
    "workspaces",
    "sessions",
    "invites",
    "shares",
    "connections",
    "members",
    "presence",
    "migrationLog",
    "skillPrefs",
    "mcpPrefs",
    "usageProfiles",
    "usageLedger",
    "usageRollups",
    "usageGrants",
  ];
  for (const key of keys) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) mismatches.push(String(key));
  }
  if (JSON.stringify(left.flags) !== JSON.stringify(right.flags)) mismatches.push("flags");
  if (JSON.stringify(left.providers) !== JSON.stringify(right.providers)) mismatches.push("providers");
  if (JSON.stringify(left.runLock) !== JSON.stringify(right.runLock)) mismatches.push("runLock");
  return mismatches;
}
