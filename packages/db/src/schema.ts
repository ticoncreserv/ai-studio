import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  login: text("login").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  locale: text("locale").notNull().default("pt-BR"),
  role: text("role").notNull().default("viewer"),
  githubId: text("github_id"),
  accessPending: boolean("access_pending").default(false),
  platformAdmin: boolean("platform_admin"),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const repositories = pgTable("repositories", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  fullName: text("full_name").notNull(),
});

export const members = pgTable("members", {
  userId: text("user_id").notNull(),
  projectId: text("project_id").notNull(),
  role: text("role").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.projectId] }),
}));

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  branch: text("branch").notNull(),
  status: text("status").notNull(),
  desired: text("desired").notNull(),
  previewToken: text("preview_token").notNull(),
  worktree: text("worktree").notNull(),
  port: integer("port"),
  vitePort: integer("vite_port"),
  lastError: text("last_error"),
  errorAt: timestamp("error_at"),
  warmedAt: timestamp("warmed_at"),
  lastActiveAt: timestamp("last_active_at"),
  bytes: integer("bytes"),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  provider: text("provider").notNull(),
  acpSessionId: text("acp_session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessionEvents = pgTable("session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  at: timestamp("at").notNull(),
  payload: jsonb("payload").notNull(),
});

export const invites = pgTable("invites", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  projectId: text("project_id").notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedBy: text("accepted_by"),
});

export const previewShares = pgTable("preview_shares", {
  token: text("token").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const connections = pgTable("connections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  env: text("env").notNull(),
  driver: text("driver").notNull(),
  host: text("host").notNull(),
  port: integer("port"),
  database: text("database").notNull(),
});

export const recipes = pgTable("recipes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  template: text("template").notNull(),
  variables: jsonb("variables").notNull().$type<string[]>(),
});

export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
});

export const providerSettings = pgTable("provider_settings", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull(),
});

export const presence = pgTable("presence", {
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  mode: text("mode").notNull(),
  at: timestamp("at").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
}));

export const workspaceLeases = pgTable("workspace_leases", {
  workspaceId: text("workspace_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: text("user_id").notNull(),
  leaseUntil: timestamp("lease_until"),
  heartbeatAt: timestamp("heartbeat_at"),
});

export const migrationLog = pgTable("migration_log", {
  id: text("id").primaryKey(),
  author: text("author").notNull(),
  branch: text("branch").notNull(),
  name: text("name").notNull(),
  output: text("output"),
  at: timestamp("at").defaultNow(),
});

export const skillPrefs = pgTable("skill_prefs", {
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.name] }),
}));

export const mcpPrefs = pgTable("mcp_prefs", {
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.name] }),
}));

export const diskUsage = pgTable("disk_usage", {
  workspaceId: text("workspace_id").primaryKey(),
  bytes: integer("bytes").notNull(),
});

export const storeMutex = pgTable("store_mutex", {
  id: text("id").primaryKey(),
  holder: text("holder"),
  at: timestamp("at"),
});
