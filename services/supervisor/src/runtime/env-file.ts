import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

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

export function mergeWorktreeEnv(worktree: string, overlay: Record<string, string>): Record<string, string> {
  const example = readEnvFile(join(worktree, ".env.example"));
  const current = readEnvFile(join(worktree, ".env"));
  const merged = { ...example, ...current, ...overlay };
  if (!merged.APP_KEY) merged.APP_KEY = `base64:${randomBytes(32).toString("base64")}`;
  writeFileSync(join(worktree, ".env"), serializeEnvFile(merged));
  return merged;
}

export function connectionsFromWorktree(worktree: string): Array<{
  id: string;
  name: string;
  kind: "app" | "erp";
  env: "homologation" | "production";
  driver: "mariadb" | "sqlsrv";
  host: string;
  database: string;
}> {
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
    DB_DATABASE: env.DB_DATABASE || "",
  });
}

export function connectionsFromEnv(env: Record<string, string>): Array<{
  id: string;
  name: string;
  kind: "app" | "erp";
  env: "homologation" | "production";
  driver: "mariadb" | "sqlsrv";
  host: string;
  database: string;
}> {
  const driver = env.DB_CONNECTION === "sqlsrv" ? "sqlsrv" as const : "mariadb" as const;
  const rows: Array<{
    id: string;
    name: string;
    kind: "app" | "erp";
    env: "homologation" | "production";
    driver: "mariadb" | "sqlsrv";
    host: string;
    database: string;
  }> = [
    {
      id: "app",
      name: env.DB_CONNECTION || "app",
      kind: "app",
      env: "homologation",
      driver,
      host: env.DB_HOST || "127.0.0.1",
      database: env.DB_DATABASE || "",
    },
  ];
  for (const [key, value] of Object.entries(env)) {
    if (!key.endsWith("_DB_CONNECTION") && !key.endsWith("_DB_HOST")) continue;
    const prefix = key.replace(/_DB_(CONNECTION|HOST)$/, "");
    const id = prefix.toLowerCase();
    if (rows.some((row) => row.id === id)) continue;
    rows.push({
      id,
      name: prefix,
      kind: "erp",
      env: "homologation",
      driver: (env[`${prefix}_DB_CONNECTION`] ?? value) === "sqlsrv" ? "sqlsrv" : "mariadb",
      host: env[`${prefix}_DB_HOST`] ?? env.DB_HOST ?? "",
      database: env[`${prefix}_DB_DATABASE`] ?? "",
    });
  }
  return rows.filter((row) => row.host || row.database);
}
