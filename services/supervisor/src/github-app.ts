import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FALLBACK_REPO_OWNER_LOGIN } from "@atelier/domain";
import { appJwt } from "./github.js";
import { repoRoot } from "./paths.js";

export interface GitHubAppCredentials {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  slug?: string;
  htmlUrl?: string;
  installationId?: string;
  ownerLogin?: string;
}

export interface GitHubAppManifest {
  name: string;
  url: string;
  description: string;
  redirect_url: string;
  callback_urls: string[];
  setup_url: string;
  hook_attributes: { url: string; active: false };
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

function storedGitHubOwnerLogin(path: string): string {
  if (!existsSync(path)) return "";
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { ownerLogin?: string };
    return typeof raw.ownerLogin === "string" ? raw.ownerLogin.trim() : "";
  } catch {
    return "";
  }
}

export function githubRepoOwnerLogin(path = githubAppStorePath()): string {
  const stored = storedGitHubOwnerLogin(path);
  if (stored) return stored;
  const repo = process.env.ATELIER_REPO ?? "ticoncreserv/app";
  const fromRepo = repo.split("/")[0]?.trim();
  return fromRepo || FALLBACK_REPO_OWNER_LOGIN;
}

export const GITHUB_OAUTH_CALLBACK_PATH = "/api/auth/github/callback";
export const GITHUB_SETUP_CALLBACK_PATH = "/api/setup/github/callback";
export const GITHUB_WEBHOOK_PATH = "/api/webhooks/github";
export const GITHUB_SETUP_PATH = "/setup/github";
export const GITHUB_OAUTH_START_PATH = "/api/auth/github";

export const GITHUB_OAUTH_CALLBACK_ALIASES = [
  GITHUB_OAUTH_CALLBACK_PATH,
  "/auth/github/callback",
  "/api/github/callback",
  "/github/callback",
] as const;

export const GITHUB_SETUP_CALLBACK_ALIASES = [
  GITHUB_SETUP_CALLBACK_PATH,
  "/setup/github/callback",
] as const;

export const GITHUB_ACCESSED_PATHS = [
  ...GITHUB_OAUTH_CALLBACK_ALIASES,
  ...GITHUB_SETUP_CALLBACK_ALIASES,
  GITHUB_SETUP_PATH,
  GITHUB_OAUTH_START_PATH,
  "/auth/github",
  GITHUB_WEBHOOK_PATH,
  "/webhooks/github",
] as const;

export function atelierListenPort(): number {
  const n = Number(process.env.NUXT_PORT || process.env.PORT || "43123");
  return Number.isFinite(n) && n > 0 ? n : 43123;
}

export function githubLoopbackListenPorts(): number[] {
  const extra = (process.env.ATELIER_LOOPBACK_PORTS || "80,8080")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set([atelierListenPort(), ...extra])];
}

function splitHost(host: string): { name: string; port: string } {
  const trimmed = host.trim().replace(/:$/, "");
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

function formatHostname(name: string): string {
  return name === "::1" || (name.includes(":") && !name.startsWith("[")) ? `[${name.replace(/^\[|\]$/g, "")}]` : name;
}

function formatOrigin(protocol: string, name: string, port?: string): string {
  const host = formatHostname(name);
  if (!port || isBrowserDefaultPort(port)) return `${protocol}://${host}`;
  return `${protocol}://${host}:${port}`;
}

export function isLoopbackOrigin(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return isLoopback(url.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  return formatOrigin(url.protocol.replace(":", ""), url.hostname, url.port);
}

export function atelierPublicUrl(host?: string, proto?: string, forwardedPort?: string): string {
  const listen = String(atelierListenPort());
  const protocol = proto === "https" ? "https" : "http";

  if (host) {
    const { name, port } = splitHost(host);
    if (isLoopback(name)) {
      const next = !isBrowserDefaultPort(port) ? port : !isBrowserDefaultPort(forwardedPort) ? forwardedPort! : listen;
      return formatOrigin(protocol, name, next || listen);
    }
    const next = port && !isBrowserDefaultPort(port) ? port : forwardedPort && !isBrowserDefaultPort(forwardedPort) ? forwardedPort : "";
    return formatOrigin(protocol, name, next);
  }

  const envUrl = process.env.ATELIER_PUBLIC_URL?.replace(/\/$/, "");
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      if (isLoopback(url.hostname) && isBrowserDefaultPort(url.port)) {
        return formatOrigin(url.protocol.replace(":", ""), url.hostname, listen);
      }
      return normalizeOrigin(envUrl);
    } catch {
      return envUrl;
    }
  }

  return `http://127.0.0.1:${listen}`;
}

/** Origin GitHub and browsers should call. A dedicated domain in ATELIER_PUBLIC_URL wins over :43123. */
export function atelierCanonicalOrigin(requestOrigin?: string): string {
  const envUrl = process.env.ATELIER_PUBLIC_URL?.replace(/\/$/, "");
  if (envUrl && !isLoopbackOrigin(envUrl)) return normalizeOrigin(envUrl);
  if (requestOrigin && !isLoopbackOrigin(requestOrigin)) return normalizeOrigin(requestOrigin);
  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin.includes("://") ? requestOrigin : `http://${requestOrigin}`);
      return atelierPublicUrl(url.host, url.protocol.replace(":", ""), url.port);
    } catch {
      return atelierPublicUrl();
    }
  }
  return atelierPublicUrl();
}

export function shouldIncludeLoopbackCallbacks(origin?: string): boolean {
  const flag = (process.env.ATELIER_INCLUDE_LOOPBACK_CALLBACKS ?? "").toLowerCase();
  if (flag === "1" || flag === "true" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return isLoopbackOrigin(atelierCanonicalOrigin(origin));
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

export function githubLoopbackHosts(): string[] {
  return ["127.0.0.1", "localhost", "[::1]"];
}

export function originWithPort(host: string, port: number): string {
  if (port === 80) return `http://${host}`;
  if (port === 443) return `https://${host}`;
  return `http://${host}:${port}`;
}

export function githubLoopbackOrigins(ports = githubLoopbackListenPorts()): string[] {
  const origins = new Set<string>();
  for (const host of githubLoopbackHosts()) {
    for (const port of ports) origins.add(originWithPort(host, port));
  }
  return [...origins];
}

export function githubAppRegisteredCallbackUrls(origin?: string): string[] {
  const path = GITHUB_OAUTH_CALLBACK_PATH;
  const canonical = atelierCanonicalOrigin(origin);
  const ordered = [`${canonical}${path}`];
  if (shouldIncludeLoopbackCallbacks(canonical)) {
    const port = atelierListenPort();
    ordered.push(
      `http://127.0.0.1:${port}${path}`,
      `http://localhost:${port}${path}`,
      `http://localhost${path}`,
      `http://127.0.0.1${path}`,
      `http://[::1]:${port}${path}`,
      `http://localhost:8080${path}`,
      `http://127.0.0.1:8080${path}`,
    );
  }
  return [...new Set(ordered)].slice(0, 10);
}

export function githubAppOAuthCallbackUrls(origin?: string): string[] {
  const urls = new Set<string>(githubAppRegisteredCallbackUrls(origin));
  if (!shouldIncludeLoopbackCallbacks(origin)) return [...urls];
  const origins = new Set<string>(githubLoopbackOrigins());
  if (origin) origins.add(origin.replace(/\/$/, ""));
  for (const next of origins) {
    for (const path of GITHUB_OAUTH_CALLBACK_ALIASES) urls.add(`${next}${path}`);
  }
  urls.add(`http://localhost:${GITHUB_OAUTH_CALLBACK_PATH}`);
  urls.add(`http://127.0.0.1:${GITHUB_OAUTH_CALLBACK_PATH}`);
  return [...urls];
}

export function githubAppAccessedUrls(origin?: string): string[] {
  const canonical = atelierCanonicalOrigin(origin);
  const origins = new Set<string>([canonical]);
  if (shouldIncludeLoopbackCallbacks(canonical)) {
    for (const next of githubLoopbackOrigins()) origins.add(next);
  }
  const urls = new Set<string>();
  for (const next of origins) {
    for (const path of GITHUB_ACCESSED_PATHS) urls.add(`${next}${path}`);
  }
  return [...urls];
}

export function preferredOAuthRedirectUri(origin?: string): string {
  return `${atelierCanonicalOrigin(origin)}${GITHUB_OAUTH_CALLBACK_PATH}`;
}

export function githubAppAuthorizeRedirectUri(origin?: string): string {
  const canonical = atelierCanonicalOrigin(origin);
  if (!isLoopbackOrigin(canonical)) return `${canonical}${GITHUB_OAUTH_CALLBACK_PATH}`;
  return `http://localhost${GITHUB_OAUTH_CALLBACK_PATH}`;
}

export function oauthRedirectUriForIncomingHost(host?: string, proto?: string, forwardedPort?: string): string {
  if (host) {
    const { name, port } = splitHost(host);
    if (isLoopback(name) && isBrowserDefaultPort(port) && isBrowserDefaultPort(forwardedPort)) {
      const hostname = name === "::1" ? "[::1]" : name;
      return `http://${hostname}${GITHUB_OAUTH_CALLBACK_PATH}`;
    }
  }
  return `${atelierPublicUrl(host, proto, forwardedPort)}${GITHUB_OAUTH_CALLBACK_PATH}`;
}

export function githubOAuthRedirectCandidates(preferred?: string): string[] {
  const canonical = preferred
    ? preferred.replace(/\/api\/auth\/github\/callback$/, "")
    : atelierCanonicalOrigin();
  const extras = [preferred, `${atelierCanonicalOrigin(canonical)}${GITHUB_OAUTH_CALLBACK_PATH}`];
  if (shouldIncludeLoopbackCallbacks(canonical)) {
    const port = String(atelierListenPort());
    extras.push(
      `http://localhost${GITHUB_OAUTH_CALLBACK_PATH}`,
      `http://localhost:${GITHUB_OAUTH_CALLBACK_PATH}`,
      `http://127.0.0.1:${port}${GITHUB_OAUTH_CALLBACK_PATH}`,
      `http://localhost:${port}${GITHUB_OAUTH_CALLBACK_PATH}`,
      `http://127.0.0.1${GITHUB_OAUTH_CALLBACK_PATH}`,
      `http://127.0.0.1:${GITHUB_OAUTH_CALLBACK_PATH}`,
      `http://[::1]:${port}${GITHUB_OAUTH_CALLBACK_PATH}`,
    );
  }
  extras.push(...githubAppOAuthCallbackUrls(canonical));
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const url of extras) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export async function syncGitHubAppPublicUrls(
  creds = loadGitHubAppCredentials(),
  fetchImpl: typeof fetch = fetch,
  origin?: string,
): Promise<boolean> {
  if (!creds?.appId || !creds.privateKey) return false;
  const publicOrigin = atelierCanonicalOrigin(origin);
  const body = {
    url: publicOrigin,
    setup_url: `${publicOrigin}${GITHUB_SETUP_PATH}`,
    callback_urls: githubAppRegisteredCallbackUrls(publicOrigin),
    hook_attributes: { url: `${publicOrigin}${GITHUB_WEBHOOK_PATH}` },
  };
  try {
    const jwt = appJwt(creds.appId, creds.privateKey);
    const res = await fetchImpl("https://api.github.com/app", {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "atelier",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function saveGitHubInstallationId(installationId: string, path = githubAppStorePath()): void {
  const creds = loadGitHubAppCredentials(path);
  if (!creds || !installationId) return;
  if (creds.installationId === installationId) return;
  saveGitHubAppCredentials({ ...creds, installationId }, path);
}

export function githubAppManifest(publicUrl: string): GitHubAppManifest {
  const origin = atelierCanonicalOrigin(publicUrl);
  return {
    name: "Atelier",
    url: origin,
    description: "Self-hosted studio for assisted creation on ticoncreserv/app.",
    redirect_url: `${origin}${GITHUB_SETUP_CALLBACK_PATH}`,
    callback_urls: githubAppRegisteredCallbackUrls(origin),
    setup_url: `${origin}${GITHUB_SETUP_PATH}`,
    hook_attributes: { url: `${origin}${GITHUB_WEBHOOK_PATH}`, active: false },
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

export function githubAppWebhookSettingsUrl(creds?: Pick<GitHubAppCredentials, "slug"> | null): string {
  const slug = creds?.slug;
  if (slug) return `https://github.com/organizations/${githubAppOrg()}/settings/apps/${slug}`;
  return `https://github.com/organizations/${githubAppOrg()}/settings/apps`;
}

export function verifyGitHubWebhookSignature(
  payload: string | Buffer,
  secret: string,
  signature: string | undefined,
): boolean {
  if (!secret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function ensureGitHubWebhookSecret(path = githubAppStorePath()): string {
  const fromEnv = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  const creds = loadGitHubAppCredentials(path);
  if (fromEnv) {
    if (creds && creds.webhookSecret !== fromEnv) {
      saveGitHubAppCredentials({ ...creds, webhookSecret: fromEnv }, path);
    }
    return fromEnv;
  }
  if (creds?.webhookSecret) {
    process.env.GITHUB_WEBHOOK_SECRET = creds.webhookSecret;
    return creds.webhookSecret;
  }
  const secret = randomBytes(32).toString("hex");
  process.env.GITHUB_WEBHOOK_SECRET = secret;
  if (creds) saveGitHubAppCredentials({ ...creds, webhookSecret: secret }, path);
  return secret;
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
      installationId: raw.installationId,
      ownerLogin: raw.ownerLogin,
    };
  } catch {
    return null;
  }
}

export function saveGitHubAppCredentials(creds: GitHubAppCredentials, path = githubAppStorePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
}

export function persistRepoOwnerLogin(path = githubAppStorePath()): string {
  const login = githubRepoOwnerLogin(path);
  const creds = loadGitHubAppCredentials(path);
  if (creds && !creds.ownerLogin?.trim()) {
    saveGitHubAppCredentials({ ...creds, ownerLogin: login }, path);
  }
  return login;
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
  ensureGitHubWebhookSecret();
  persistRepoOwnerLogin();
  return loadGitHubAppCredentials();
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
    ensureGitHubWebhookSecret(storePath);
    return { creds: loadGitHubAppCredentials(storePath) ?? creds, reused: false };
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
