import type { WorkspaceSpec } from "@atelier/contracts";

export const defaultWorkspaceSpec = (): WorkspaceSpec => ({
  phpVersion: "8.5",
  documentRoot: "public",
  healthCheck: { path: "/up", timeoutMs: 15_000 },
  processes: [
    { name: "caddy-php", command: "node", args: ["scripts/preview-server.mjs"], optional: false, hmrOnly: false },
    { name: "queue", command: "php", args: ["artisan", "queue:work", "--tries=1", "--timeout=60"], optional: true, hmrOnly: false },
    { name: "vite", command: "npm", args: ["run", "dev"], optional: true, hmrOnly: true },
  ],
  envContract: [
    { key: "APP_KEY", kind: "structural", required: true },
    { key: "APP_URL", kind: "isolation", required: true },
    { key: "SESSION_COOKIE", kind: "isolation", required: true },
    { key: "REDIS_CLIENT", kind: "structural", required: true },
    { key: "REDIS_PREFIX", kind: "isolation", required: true },
    { key: "CACHE_PREFIX", kind: "isolation", required: true },
    { key: "QUEUE_NAME", kind: "isolation", required: true },
    { key: "DB_CONNECTION", kind: "structural", required: true },
    { key: "DB_CONNECTION_BETONDESPACHO", kind: "structural", required: false },
    { key: "TOPCON_DB_CONNECTION", kind: "structural", required: false },
    { key: "MAIL_MAILER", kind: "sideEffect", required: true },
    { key: "BROADCAST_CONNECTION", kind: "sideEffect", required: true },
    { key: "DB_PASSWORD", kind: "credential", required: false },
  ],
  sqlServerDrivers: ["dblib", "odbc"],
  forbiddenExtensions: ["pdo_sqlsrv", "redis"],
});

export const PREVIEW_SIDE_EFFECTS: Record<string, string> = {
  MAIL_MAILER: "log",
  BROADCAST_CONNECTION: "log",
  REDIS_CLIENT: "predis",
  QUEUE_CONNECTION: "database",
  CACHE_STORE: "file",
  SESSION_DRIVER: "file",
  APP_ENV: "local",
  APP_DEBUG: "true",
  OIDC_ENABLED: "false",
  CONSUPPLY_WSSOLICITACAO_ENABLED: "false",
  CONSUPPLY_WSAPROVSC_ENABLED: "false",
  CONSUPPLY_WSCOTACAO_ENABLED: "false",
  CONSUPPLY_RECEITAWS_ENABLED: "false",
  MAILERSEND_API_KEY: "",
  BLIP_AUTH_KEY: "",
};

export function isolationEnv(workspaceId: string, previewUrl: string): Record<string, string> {
  const slug = workspaceId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return {
    APP_URL: previewUrl,
    SESSION_COOKIE: `atelier_${slug}_session`,
    REDIS_PREFIX: `atelier_${slug}_`,
    CACHE_PREFIX: `atelier_${slug}_`,
    QUEUE_NAME: `atelier_${slug}`,
    TRUSTED_DEVICE_COOKIE_NAME: `atelier_${slug}_2fa`,
  };
}

export function validateEnvContract(
  spec: WorkspaceSpec,
  env: Record<string, string | undefined>,
): { missing: string[]; unknown: string[] } {
  const missing = spec.envContract.filter((c) => c.required && !env[c.key]).map((c) => c.key);
  const known = new Set(spec.envContract.map((c) => c.key));
  const unknown = Object.keys(env).filter((k) => !known.has(k) && k.startsWith("CONSUPPLY_"));
  return { missing, unknown };
}
