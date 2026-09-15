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

interface DbShape {
  users: UserRecord[];
  workspaces: WorkspaceRecord[];
  sessions: SessionRecord[];
  invites: InviteRecord[];
  shares: PreviewShare[];
  connections: ConnectionRecord[];
  recipes: RecipeRecord[];
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
    { id: "beton-test", name: "betonTeste", kind: "erp", env: "homologation", driver: "sqlsrv", host: "10.10.0.211", database: "betonMIXProducao_Portal" },
  ],
  recipes: [
    {
      id: "inertia-crud",
      title: "Inertia CRUD for model",
      template: "Create an Inertia Vue page that lists, creates, and edits the {{model}} model. Follow existing Pages conventions. Write code in English.",
      variables: ["model"],
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
    return JSON.parse(readFileSync(this.file, "utf8")) as DbShape;
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
