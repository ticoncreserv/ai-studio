import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

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

export function redactEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = /password|secret|token|key|private/i.test(key) && !key.endsWith("_NAME") ? "••••" : value;
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

export function mergeWorktreeEnv(worktree: string, overlay: Record<string, string>): Record<string, string> {
  const example = readEnvFile(join(worktree, ".env.example"));
  const current = readEnvFile(join(worktree, ".env"));
  const merged = { ...example, ...current, ...overlay };
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
