import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { PREVIEW_SIDE_EFFECTS } from "./spec.js";

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 1) continue;
    let value = trimmed.slice(i + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, i)] = value;
  }
  return out;
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

export function serializeEnvFile(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value.includes(" ") || value.includes("#") ? JSON.stringify(value) : value}`)
    .join("\n")
    .concat("\n");
}

export const REDACTED_ENV_VALUE = "••••";

export function redactEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = isSecretEnvKey(key) ? REDACTED_ENV_VALUE : value;
  }
  return out;
}

export function pickSecretEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (isSecretEnvKey(key)) out[key] = value;
  }
  return out;
}

/** Env for artisan CLI that must not block on unreachable 10.x homologation hosts. */
export function artisanOfflineEnv(env: Record<string, string>, worktree: string): Record<string, string> {
  const sqlite = join(worktree, "database", "atelier-offline.sqlite");
  mkdirSync(dirname(sqlite), { recursive: true });
  if (!existsSync(sqlite)) writeFileSync(sqlite, "");
  const out: Record<string, string> = { ...env };
  for (const key of Object.keys(out)) {
    if (key === "DB_HOST" || key.startsWith("DB_HOST_") || key.endsWith("_DB_HOST")) out[key] = "127.0.0.1";
    if (key === "DB_PORT" || key.startsWith("DB_PORT_") || key.endsWith("_DB_PORT")) out[key] = "1";
  }
  out.DB_CONNECTION = "sqlite";
  out.DB_DATABASE = sqlite;
  out.MYSQL_ATTR_CONNECT_TIMEOUT = "1";
  return out;
}

export const FORCED_PREVIEW_KEYS = new Set([
  "APP_URL",
  "SESSION_COOKIE",
  "REDIS_PREFIX",
  "CACHE_PREFIX",
  "QUEUE_NAME",
  "TRUSTED_DEVICE_COOKIE_NAME",
  "PORT",
  "MAIL_MAILER",
  "BROADCAST_CONNECTION",
  "REDIS_CLIENT",
  "QUEUE_CONNECTION",
  "CACHE_STORE",
  "SESSION_DRIVER",
  "APP_ENV",
  "APP_DEBUG",
  "OIDC_ENABLED",
  "CONSUPPLY_WSSOLICITACAO_ENABLED",
  "CONSUPPLY_WSAPROVSC_ENABLED",
  "CONSUPPLY_WSCOTACAO_ENABLED",
  "CONSUPPLY_RECEITAWS_ENABLED",
  "MAILERSEND_API_KEY",
  "BLIP_AUTH_KEY",
]);

export type EnvKeyOrigin = "example" | "global" | "user" | "isolation";

export type MergeWorktreeEnvLayers = {
  global?: Record<string, string>;
  user?: Record<string, string>;
  userId?: string;
  envRoot?: string;
};

export function layeredEnvRoot(envRoot?: string): string {
  return envRoot ?? join(process.cwd(), "var", "env");
}

export function globalEnvPath(envRoot?: string): string {
  return join(layeredEnvRoot(envRoot), "global.env");
}

export function userEnvPath(userId: string, envRoot?: string): string {
  return join(layeredEnvRoot(envRoot), "users", `${userId}.env`);
}

export function providersEnvPath(envRoot?: string): string {
  return join(layeredEnvRoot(envRoot), "providers.env");
}

export function writeEnvFile(path: string, env: Record<string, string>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeEnvFile(env));
}

export function readGlobalEnv(envRoot?: string): Record<string, string> {
  return readEnvFile(globalEnvPath(envRoot));
}

/** Isolation / preview side-effects that must not land in the shared environment draft. */
export const GLOBAL_ENV_SEED_SKIP = new Set([
  "APP_URL",
  "SESSION_COOKIE",
  "PORT",
  "REDIS_PREFIX",
  "CACHE_PREFIX",
  "QUEUE_NAME",
  "TRUSTED_DEVICE_COOKIE_NAME",
  ...Object.keys(PREVIEW_SIDE_EFFECTS),
]);

/**
 * Prefill the admin environment editor from `.env.example` plus worktree `.env`
 * keys that are not isolation or preview side-effects. Does not write a file.
 */
export function seedGlobalEnvDraft(
  example: Record<string, string>,
  worktree: Record<string, string> = {},
): Record<string, string> {
  const skipAlways = new Set(["APP_URL", "SESSION_COOKIE", "PORT"]);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(example)) {
    if (skipAlways.has(key)) continue;
    out[key] = value;
  }
  for (const [key, value] of Object.entries(worktree)) {
    if (GLOBAL_ENV_SEED_SKIP.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function writeGlobalEnv(env: Record<string, string>, envRoot?: string): void {
  writeEnvFile(globalEnvPath(envRoot), env);
}

export function readUserEnv(userId: string, envRoot?: string): Record<string, string> {
  return readEnvFile(userEnvPath(userId, envRoot));
}

export function writeUserEnv(userId: string, env: Record<string, string>, envRoot?: string): void {
  writeEnvFile(userEnvPath(userId, envRoot), env);
}

export function readProviderSecrets(envRoot?: string): Record<string, string> {
  return readEnvFile(providersEnvPath(envRoot));
}

export function writeProviderSecrets(env: Record<string, string>, envRoot?: string): void {
  writeEnvFile(providersEnvPath(envRoot), env);
}

export function isSecretEnvKey(key: string): boolean {
  return /password|secret|token|key|private/i.test(key) && !key.endsWith("_NAME");
}

export function restoreRedactedEnv(incoming: Record<string, string>, current: Record<string, string>): Record<string, string> {
  const out = { ...incoming };
  for (const [key, value] of Object.entries(out)) {
    if (value === REDACTED_ENV_VALUE) out[key] = current[key] ?? "";
  }
  return out;
}

export function envKeyOrigin(
  key: string,
  layers: {
    example: Record<string, string>;
    global: Record<string, string>;
    user: Record<string, string>;
    overlay: Record<string, string>;
  },
): EnvKeyOrigin {
  if (key in layers.overlay || FORCED_PREVIEW_KEYS.has(key)) return "isolation";
  if (key in layers.user) return "user";
  if (key in layers.global) return "global";
  return "example";
}

export function migrateUserOverlay(
  worktree: string,
  userId: string,
  overlay: Record<string, string>,
  global: Record<string, string>,
  envRoot?: string,
): Record<string, string> {
  const existing = readUserEnv(userId, envRoot);
  if (Object.keys(existing).length) return existing;
  const example = readEnvFile(join(worktree, ".env.example"));
  const current = readEnvFile(join(worktree, ".env"));
  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    if (!value || key === "APP_KEY" || FORCED_PREVIEW_KEYS.has(key) || key in overlay) continue;
    const fromExample = example[key];
    const fromGlobal = global[key];
    if (fromGlobal !== undefined && fromGlobal === value) continue;
    if (fromExample !== undefined && fromExample === value && fromGlobal === undefined) continue;
    extras[key] = value;
  }
  if (Object.keys(extras).length) writeUserEnv(userId, extras, envRoot);
  return extras;
}

export function mergeWorktreeEnv(
  worktree: string,
  overlay: Record<string, string>,
  layers: MergeWorktreeEnvLayers = {},
): Record<string, string> {
  const example = readEnvFile(join(worktree, ".env.example"));
  const current = readEnvFile(join(worktree, ".env"));
  const global = layers.global ?? (layers.envRoot || layers.userId ? readGlobalEnv(layers.envRoot) : {});
  let user = layers.user ?? (layers.userId ? readUserEnv(layers.userId, layers.envRoot) : {});
  if (layers.userId && !layers.user && !Object.keys(user).length) {
    user = migrateUserOverlay(worktree, layers.userId, overlay, global, layers.envRoot);
  }
  const merged = { ...example, ...global, ...user };
  if (current.APP_KEY) merged.APP_KEY = current.APP_KEY;
  Object.assign(merged, overlay);
  if (!merged.APP_KEY) merged.APP_KEY = `base64:${randomBytes(32).toString("base64")}`;
  writeFileSync(join(worktree, ".env"), serializeEnvFile(merged));
  return merged;
}

export type WorktreeConnection = {
  id: string;
  name: string;
  kind: "app" | "erp";
  env: "homologation" | "production";
  driver: "mariadb" | "sqlsrv";
  host: string;
  port: number;
  database: string;
};

export function defaultConnectionPort(driver: "mariadb" | "sqlsrv"): number {
  return driver === "sqlsrv" ? 1433 : 3306;
}

export function parseConnectionPort(raw: string | undefined, driver: "mariadb" | "sqlsrv"): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  return defaultConnectionPort(driver);
}

function connectionDriver(raw: string | undefined, port?: number): "mariadb" | "sqlsrv" {
  if (raw === "sqlsrv" || raw === "sqlserver") return "sqlsrv";
  if (raw === "mysql" || raw === "mariadb") return "mariadb";
  if (port === 1433) return "sqlsrv";
  return "mariadb";
}

export function connectionsFromWorktree(worktree: string): WorktreeConnection[] {
  const env = { ...readEnvFile(join(worktree, ".env.example")), ...readEnvFile(join(worktree, ".env")) };
  const fromEnv = connectionsFromEnv(env);
  if (fromEnv.length) return fromEnv;
  const config = join(worktree, "config", "database.php");
  if (!existsSync(config)) return [];
  const text = readFileSync(config, "utf8");
  if (!/['"](?:mysql|mariadb|sqlsrv)['"]/.test(text)) return [];
  return connectionsFromEnv({
    DB_CONNECTION: env.DB_CONNECTION || "mysql",
    DB_HOST: env.DB_HOST || "127.0.0.1",
    DB_PORT: env.DB_PORT || "",
    DB_DATABASE: env.DB_DATABASE || "",
  });
}

export function connectionsFromEnv(env: Record<string, string>): WorktreeConnection[] {
  const driver = connectionDriver(env.DB_CONNECTION, Number(env.DB_PORT));
  const rows: WorktreeConnection[] = [
    {
      id: "app",
      name: env.DB_CONNECTION || "app",
      kind: "app",
      env: "homologation",
      driver,
      host: env.DB_HOST || "127.0.0.1",
      port: parseConnectionPort(env.DB_PORT, driver),
      database: env.DB_DATABASE || "",
    },
  ];
  const push = (row: WorktreeConnection) => {
    if (rows.some((existing) => existing.id === row.id || (existing.host === row.host && existing.port === row.port && existing.database === row.database))) {
      return;
    }
    rows.push(row);
  };
  for (const [key, value] of Object.entries(env)) {
    if (key.endsWith("_DB_CONNECTION") || key.endsWith("_DB_HOST")) {
      const prefix = key.replace(/_DB_(CONNECTION|HOST)$/, "");
      if (prefix === "DB" || !prefix) continue;
      const nextDriver = connectionDriver(env[`${prefix}_DB_CONNECTION`] ?? (key.endsWith("_CONNECTION") ? value : undefined), Number(env[`${prefix}_DB_PORT`]));
      push({
        id: prefix.toLowerCase(),
        name: prefix,
        kind: "erp",
        env: "homologation",
        driver: nextDriver,
        host: env[`${prefix}_DB_HOST`] ?? "",
        port: parseConnectionPort(env[`${prefix}_DB_PORT`], nextDriver),
        database: env[`${prefix}_DB_DATABASE`] ?? "",
      });
      continue;
    }
    if (key.startsWith("DB_HOST_") && key !== "DB_HOST") {
      const suffix = key.slice("DB_HOST_".length);
      if (!suffix) continue;
      const nextDriver = connectionDriver(env[`DB_CONNECTION_${suffix}`], Number(env[`DB_PORT_${suffix}`]));
      push({
        id: suffix.toLowerCase(),
        name: suffix,
        kind: "erp",
        env: "homologation",
        driver: nextDriver,
        host: value,
        port: parseConnectionPort(env[`DB_PORT_${suffix}`], nextDriver),
        database: env[`DB_DATABASE_${suffix}`] ?? "",
      });
    }
  }
  return rows.filter((row) => row.host || row.database);
}
