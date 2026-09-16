import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  login: text("login").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  locale: text("locale").notNull().default("pt-BR"),
  githubId: text("github_id"),
  accessPending: boolean("access_pending").default(false),
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
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  branch: text("branch").notNull(),
  status: text("status").notNull(),
  desired: text("desired").notNull(),
  previewToken: text("preview_token").notNull(),
  worktree: text("worktree").notNull(),
  lastActiveAt: timestamp("last_active_at"),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  provider: text("provider").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessionEvents = pgTable("session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(),
  at: timestamp("at").notNull(),
  payload: jsonb("payload").notNull(),
});

export const connections = pgTable("connections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  env: text("env").notNull(),
  driver: text("driver").notNull(),
  host: text("host").notNull(),
  database: text("database").notNull(),
});

export const migrationLog = pgTable("migration_log", {
  id: text("id").primaryKey(),
  author: text("author").notNull(),
  branch: text("branch").notNull(),
  name: text("name").notNull(),
  output: text("output"),
  at: timestamp("at").defaultNow(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
});

export const diskUsage = pgTable("disk_usage", {
  workspaceId: text("workspace_id").primaryKey(),
  bytes: integer("bytes").notNull(),
});
