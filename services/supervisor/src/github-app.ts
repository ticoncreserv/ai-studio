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

export function atelierPublicUrl(host?: string, proto?: string): string {
  if (process.env.ATELIER_PUBLIC_URL) return process.env.ATELIER_PUBLIC_URL.replace(/\/$/, "");
  const hostname = host || "127.0.0.1:43123";
  const protocol = proto || "http";
  return `${protocol}://${hostname}`;
}

export function canSetupGitHubApp(): boolean {
  if (process.env.ATELIER_ALLOW_GITHUB_APP_SETUP === "0") return false;
  if (process.env.ATELIER_ALLOW_GITHUB_APP_SETUP === "1") return true;
  return process.env.NODE_ENV !== "production";
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
