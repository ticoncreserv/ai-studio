import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Role, SessionEvent, WorkspaceStatus } from "@atelier/contracts";

export interface UserRecord {
  id: string;
  login: string;
  name: string;
  email: string;
  locale: "en" | "pt-BR";
  role: Role;
  githubId?: string;
  accessPending?: boolean;
  platformAdmin?: boolean;
  disabled?: boolean;
}

export interface WorkspaceRecord {
  id: string;
  projectId: string;
  userId: string;
  branch: string;
  status: WorkspaceStatus;
  desired: WorkspaceStatus;
  previewToken: string;
  worktree: string;
  port?: number;
  vitePort?: number;
  lastError?: string;
  warmedAt?: string;
  lastActiveAt: string;
  bytes?: number;
}

export interface SessionRecord {
  id: string;
  workspaceId: string;
  title: string;
  events: SessionEvent[];
  provider: string;
  createdAt: string;
  acpSessionId?: string;
}

export interface InviteRecord {
  id: string;
  token: string;
  projectId: string;
  createdBy: string;
  expiresAt: string;
  acceptedBy?: string;
}

export interface PreviewShare {
  token: string;
  workspaceId: string;
  expiresAt: string;
}

export interface ConnectionRecord {
  id: string;
  name: string;
  kind: "app" | "erp";
  env: "homologation" | "production";
  driver: "mariadb" | "sqlsrv";
  host: string;
  port?: number;
  database: string;
}

export interface RecipeRecord {
  id: string;
  title: string;
  template: string;
  variables: string[];
}

export interface RuleRecord {
  id: string;
  level: "platform" | "project" | "user";
  title: string;
  body: string;
}

interface DbShape {
  users: UserRecord[];
  workspaces: WorkspaceRecord[];
  sessions: SessionRecord[];
  invites: InviteRecord[];
  shares: PreviewShare[];
  connections: ConnectionRecord[];
  recipes: RecipeRecord[];
  rules: RuleRecord[];
  members: Array<{ userId: string; projectId: string; role: Role }>;
  flags: Record<string, boolean>;
  providers: Record<string, { enabled: boolean }>;
  presence: Array<{ workspaceId: string; userId: string; mode: "editor" | "spectator"; at: string }>;
  runLock: Record<string, { sessionId: string; userId: string } | undefined>;
  migrationLog: Array<{ id: string; author: string; branch: string; name: string; at: string; output: string }>;
}

function mergeById<T extends { id: string }>(current: T[] | undefined, defaults: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of defaults) map.set(row.id, row);
  for (const row of current ?? []) map.set(row.id, { ...map.get(row.id), ...row });
  const order = [...defaults.map((row) => row.id), ...(current ?? []).map((row) => row.id).filter((id) => !defaults.some((row) => row.id === id))];
  return order.map((id) => map.get(id)!);
}

const emptyDb = (): DbShape => ({
  users: [],
  workspaces: [],
  sessions: [],
  invites: [],
  shares: [],
  connections: [],
  recipes: [
    {
      id: "inertia-crud",
      title: "Inertia CRUD for model",
      template: "Create an Inertia Vue page that lists, creates, and edits the {{model}} model. Follow existing Pages conventions. Write code in English.",
      variables: ["model"],
    },
    {
      id: "add-field",
      title: "Add a model field",
      template: "Add a {{model}} field across the migration, model, Form Request, and Inertia form. Do not run migrate:fresh.",
      variables: ["model"],
    },
    {
      id: "fix-preview",
      title: "Fix last preview error",
      template: "Investigate the latest preview/runtime error and fix it with a small, reviewable diff.",
      variables: [],
    },
  ],
  rules: [
    {
      id: "platform",
      level: "platform",
      title: "Platform",
      body: "Never run migrate:fresh, db:wipe, or write to ERP connections. Do not read .env files.",
    },
    {
      id: "project",
      level: "project",
      title: "Concreserv",
      body: "Follow Inertia + Vue page conventions. Keep Laravel Boost MCP available. Workaround comments are normative.",
    },
    {
      id: "user",
      level: "user",
      title: "User",
      body: "Prefer small, reviewable diffs and explain each file change.",
    },
  ],
  members: [],
  flags: { publish: false, multiProvider: false, spectator: true, recipes: true },
  providers: { cursor: { enabled: true } },
  presence: [],
  runLock: {},
  migrationLog: [],
});

export class JsonStore {
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file)) this.write(emptyDb());
  }

  get path(): string {
    return this.file;
  }

  read(): DbShape {
    const raw = JSON.parse(readFileSync(this.file, "utf8")) as Partial<DbShape>;
    const base = emptyDb();
    return {
      ...base,
      ...raw,
      connections: raw.connections ?? [],
      recipes: mergeById(raw.recipes, base.recipes),
      rules: mergeById(raw.rules, base.rules),
      flags: { ...base.flags, ...raw.flags },
      providers: { ...base.providers, ...raw.providers },
      users: raw.users ?? [],
      workspaces: raw.workspaces ?? [],
      sessions: raw.sessions ?? [],
      invites: raw.invites ?? [],
      shares: raw.shares ?? [],
      members: raw.members ?? [],
      presence: raw.presence ?? [],
      runLock: raw.runLock ?? {},
      migrationLog: raw.migrationLog ?? [],
    };
  }

  write(db: DbShape): void {
    writeFileSync(this.file, JSON.stringify(db, null, 2));
  }

  update(mutator: (db: DbShape) => void): DbShape {
    const db = this.read();
    mutator(db);
    this.write(db);
    return db;
  }
}

export function defaultStorePath(): string {
  return join(process.cwd(), "var", "platform.json");
}
