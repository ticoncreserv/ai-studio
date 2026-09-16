import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "./paths.js";

export interface GitHubAppCredentials {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  slug?: string;
  htmlUrl?: string;
}

export interface GitHubAppManifest {
  name: string;
  url: string;
  description: string;
  redirect_url: string;
  callback_urls: string[];
  setup_url: string;
  public: false;
  request_oauth_on_install: true;
  default_permissions: {
    contents: "write";
    metadata: "read";
    pull_requests: "write";
    emails: "read";
  };
}

const ENV_KEYS = {
  appId: "GITHUB_APP_ID",
  clientId: "GITHUB_CLIENT_ID",
  clientSecret: "GITHUB_CLIENT_SECRET",
  privateKey: "GITHUB_APP_PRIVATE_KEY",
  webhookSecret: "GITHUB_WEBHOOK_SECRET",
} as const;

export function githubAppStorePath(): string {
  return join(repoRoot(), "var", "github-app.json");
}

export function githubAppOrg(): string {
  if (process.env.ATELIER_GITHUB_ORG) return process.env.ATELIER_GITHUB_ORG;
  const repo = process.env.ATELIER_REPO ?? "ticoncreserv/app";
  return repo.split("/")[0] || "ticoncreserv";
}

export function githubAppRepo(): string {
  return process.env.ATELIER_REPO ?? "ticoncreserv/app";
}

export function atelierListenPort(): number {
  const n = Number(process.env.NUXT_PORT || process.env.PORT || "43123");
  return Number.isFinite(n) && n > 0 ? n : 43123;
}

function splitHost(host: string): { name: string; port: string } {
  const trimmed = host.trim();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return { name: trimmed.slice(1, end), port: trimmed.slice(end + 1).replace(/^:/, "") };
  }
  const i = trimmed.lastIndexOf(":");
  if (i > 0) return { name: trimmed.slice(0, i), port: trimmed.slice(i + 1) };
  return { name: trimmed, port: "" };
}

function isLoopback(name: string): boolean {
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

function isBrowserDefaultPort(port: string | undefined): boolean {
  return !port || port === "80" || port === "443";
}

export function atelierPublicUrl(host?: string, proto?: string, forwardedPort?: string): string {
  const listen = String(atelierListenPort());
  const protocol = proto === "https" ? "https" : "http";

  if (host) {
    const { name, port } = splitHost(host);
    if (isLoopback(name)) {
      const next = !isBrowserDefaultPort(port) ? port : !isBrowserDefaultPort(forwardedPort) ? forwardedPort! : listen;
      return `${protocol}://${name}:${next}`;
    }
    if (port) return `${protocol}://${name}:${port}`;
    if (forwardedPort && !isBrowserDefaultPort(forwardedPort)) return `${protocol}://${name}:${forwardedPort}`;
    return `${protocol}://${name}`;
  }

  const envUrl = process.env.ATELIER_PUBLIC_URL?.replace(/\/$/, "");
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      if (isLoopback(url.hostname) && isBrowserDefaultPort(url.port)) {
        return `${url.protocol}//${url.hostname}:${listen}`;
      }
      return envUrl;
    } catch {
      return envUrl;
    }
  }

  return `http://127.0.0.1:${listen}`;
}

export function canSetupGitHubApp(): boolean {
  const flag = (process.env.ATELIER_ALLOW_GITHUB_APP_SETUP ?? "").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return process.env.NODE_ENV !== "production";
}

export function githubAppSetupStatePath(): string {
  return join(repoRoot(), "var", "github-app-setup.json");
}

export function saveGitHubAppSetupState(state: string): void {
  mkdirSync(dirname(githubAppSetupStatePath()), { recursive: true });
  writeFileSync(githubAppSetupStatePath(), `${JSON.stringify({ state, at: Date.now() })}\n`, { mode: 0o600 });
}

export function matchGitHubAppSetupState(state: string): boolean {
  if (!state) return false;
  const path = githubAppSetupStatePath();
  if (!existsSync(path)) return false;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { state?: string; at?: number };
    const fresh = typeof raw.at === "number" && Date.now() - raw.at < 60 * 60 * 1000;
    return fresh && raw.state === state;
  } catch {
    return false;
  }
}

export function hasGitHubOAuth(): boolean {
  applyStoredGitHubAppCredentials();
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function githubAppManifest(publicUrl: string): GitHubAppManifest {
  const origin = publicUrl.replace(/\/$/, "");
  return {
    name: "Atelier",
    url: origin,
    description: "Self-hosted studio for assisted creation on ticoncreserv/app.",
    redirect_url: `${origin}/api/setup/github/callback`,
    callback_urls: [`${origin}/api/auth/github/callback`],
    setup_url: `${origin}/setup/github`,
    public: false,
    request_oauth_on_install: true,
    default_permissions: {
      contents: "write",
      metadata: "read",
      pull_requests: "write",
      emails: "read",
    },
  };
}

export function githubAppCreateAction(org: string, state: string): string {
  const encoded = encodeURIComponent(state);
  return `https://github.com/organizations/${org}/settings/apps/new?state=${encoded}`;
}

export function githubAppInstallUrl(creds: GitHubAppCredentials): string {
  if (creds.slug) return `https://github.com/apps/${creds.slug}/installations/new`;
  if (creds.htmlUrl) return `${creds.htmlUrl.replace(/\/$/, "")}/installations/new`;
  return `https://github.com/${githubAppRepo()}/settings/installations`;
}

export function loadGitHubAppCredentials(path = githubAppStorePath()): GitHubAppCredentials | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<GitHubAppCredentials>;
    if (!raw.clientId || !raw.clientSecret) return null;
    return {
      appId: raw.appId ?? "",
      clientId: raw.clientId,
      clientSecret: raw.clientSecret,
      privateKey: raw.privateKey ?? "",
      webhookSecret: raw.webhookSecret ?? "",
      slug: raw.slug,
      htmlUrl: raw.htmlUrl,
    };
  } catch {
    return null;
  }
}

export function saveGitHubAppCredentials(creds: GitHubAppCredentials, path = githubAppStorePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
}

export function applyGitHubAppCredentials(creds: GitHubAppCredentials): void {
  const pairs: Array<[keyof typeof ENV_KEYS, string]> = [
    ["appId", creds.appId],
    ["clientId", creds.clientId],
    ["clientSecret", creds.clientSecret],
    ["privateKey", creds.privateKey],
    ["webhookSecret", creds.webhookSecret],
  ];
  for (const [key, value] of pairs) {
    if (!value) continue;
    const env = ENV_KEYS[key];
    if (!process.env[env]) process.env[env] = value;
  }
}

export function applyStoredGitHubAppCredentials(): GitHubAppCredentials | null {
  const creds = loadGitHubAppCredentials();
  if (creds) applyGitHubAppCredentials(creds);
  return creds;
}

export function credentialsFromManifestResponse(body: Record<string, unknown>): GitHubAppCredentials {
  const clientId = String(body.client_id ?? "");
  const clientSecret = String(body.client_secret ?? "");
  if (!clientId || !clientSecret) throw new Error("GitHub did not return OAuth credentials");
  return {
    appId: body.id != null ? String(body.id) : "",
    clientId,
    clientSecret,
    privateKey: String(body.pem ?? ""),
    webhookSecret: String(body.webhook_secret ?? ""),
    slug: body.slug ? String(body.slug) : undefined,
    htmlUrl: body.html_url ? String(body.html_url) : undefined,
  };
}

export async function redeemGitHubAppCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
  storePath = githubAppStorePath(),
): Promise<{ creds: GitHubAppCredentials; reused: boolean }> {
  const existing = loadGitHubAppCredentials(storePath);
  try {
    const creds = await convertGitHubAppManifest(code, fetchImpl);
    saveGitHubAppCredentials(creds, storePath);
    applyGitHubAppCredentials(creds);
    return { creds, reused: false };
  } catch (error) {
    if (existing) {
      applyGitHubAppCredentials(existing);
      return { creds: existing, reused: true };
    }
    throw error;
  }
}

export async function convertGitHubAppManifest(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubAppCredentials> {
  const res = await fetchImpl(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "atelier",
    },
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof body.message === "string" ? body.message : `GitHub manifest conversion failed (${res.status})`);
  }
  return credentialsFromManifestResponse(body);
}
