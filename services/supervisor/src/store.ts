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
  presence: Array<{ workspaceId: string; userId: string; mode: "editor" | "spectator"; at: string }>;
  runLock: Record<string, { sessionId: string; userId: string } | undefined>;
  migrationLog: Array<{ id: string; author: string; branch: string; name: string; at: string; output: string }>;
}

const emptyDb = (): DbShape => ({
  users: [],
  workspaces: [],
  sessions: [],
  invites: [],
  shares: [],
  connections: [
    { id: "portal", name: "Portal (homologation)", kind: "app", env: "homologation", driver: "mariadb", host: "10.0.128.112", database: "PortalCliente" },
    { id: "sqlsrv", name: "sqlsrv", kind: "erp", env: "homologation", driver: "sqlsrv", host: "10.10.0.211", database: "Protheus" },
    { id: "beton-test", name: "betonTeste", kind: "erp", env: "homologation", driver: "sqlsrv", host: "10.10.0.211", database: "betonMIXProducao_Portal" },
    { id: "beton-interface", name: "betonInterfaceTeste", kind: "erp", env: "homologation", driver: "sqlsrv", host: "10.10.0.212", database: "betonInterface" },
    { id: "despacho", name: "betonDESPACHO", kind: "erp", env: "homologation", driver: "sqlsrv", host: "10.10.0.11", database: "Despacho" },
  ],
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
  presence: [],
  runLock: {},
  migrationLog: [],
});

export class JsonStore {
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file)) this.write(emptyDb());
  }

  read(): DbShape {
    const raw = JSON.parse(readFileSync(this.file, "utf8")) as Partial<DbShape>;
    const base = emptyDb();
    return {
      ...base,
      ...raw,
      connections: raw.connections?.length ? raw.connections : base.connections,
      recipes: raw.recipes?.length ? raw.recipes : base.recipes,
      rules: raw.rules?.length ? raw.rules : base.rules,
      flags: { ...base.flags, ...raw.flags },
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
