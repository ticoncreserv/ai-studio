import { createHmac, timingSafeEqual } from "node:crypto";
import { mapGitHubPermission } from "@atelier/domain";
import type { Role } from "@atelier/contracts";

export interface AuthIdentity {
  login: string;
  name: string;
  email: string;
  githubId?: string;
  locale: "en" | "pt-BR";
  role: Role;
  accessPending?: boolean;
  commitName: string;
  commitEmail: string;
}

export interface AuthProvider {
  id: "github";
  beginLogin(redirectTo: string, redirectUri?: string): Promise<{ url: string; state: string }>;
  completeLogin(input: Record<string, string>): Promise<AuthIdentity>;
  verifyRepoAccess(token: string, repo: string): Promise<{ role: Role | null; pending: boolean }>;
}

export class GitHubAuthProvider implements AuthProvider {
  id = "github" as const;

  constructor(
    private readonly clientId = process.env.GITHUB_CLIENT_ID ?? "",
    private readonly clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "",
    private readonly repo = process.env.ATELIER_REPO ?? "ticoncreserv/app",
  ) {}

  async beginLogin(redirectTo: string, redirectUri?: string): Promise<{ url: string; state: string }> {
    const state = Buffer.from(JSON.stringify({ redirectTo, redirectUri, n: Date.now() })).toString("base64url");
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("state", state);
    // GitHub Apps use permissions, not OAuth scopes. A scope list can make authorize fail.
    if (!this.clientId.startsWith("Iv1.")) url.searchParams.set("scope", "read:user user:email");
    if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
    return { url: url.toString(), state };
  }

  async completeLogin(input: Record<string, string>): Promise<AuthIdentity> {
    const redirectUri = parseOAuthState(input.state)?.redirectUri || input.redirectUri;
    const token = await this.exchangeCode(input.code ?? "", redirectUri);
    const user = (await githubJson("https://api.github.com/user", token)) as {
      login: string;
      name: string | null;
      id: number;
      email: string | null;
    };
    const emails = (await githubJson("https://api.github.com/user/emails", token).catch(() => [])) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const email =
      user.email ||
      emails.find((e) => e.primary && e.verified)?.email ||
      `${user.id}+${user.login}@users.noreply.github.com`;
    const access = await this.verifyRepoAccess(token, this.repo);
    return {
      login: user.login,
      name: user.name || user.login,
      email,
      githubId: String(user.id),
      locale: input.locale === "en" ? "en" : "pt-BR",
      role: access.role ?? "viewer",
      accessPending: access.pending,
      commitName: user.name || user.login,
      commitEmail: `${user.id}+${user.login}@users.noreply.github.com`,
    };
  }

  async verifyRepoAccess(token: string, repo: string): Promise<{ role: Role | null; pending: boolean }> {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "atelier" },
    });
    if (res.status === 404) return { role: null, pending: true };
    if (!res.ok) return { role: null, pending: true };
    const body = (await res.json()) as { permissions?: Parameters<typeof mapGitHubPermission>[0] };
    const role = mapGitHubPermission(body.permissions ?? null);
    return { role, pending: !role };
  }

  private async exchangeCode(code: string, redirectUri?: string): Promise<string> {
    // GitHub authorization codes are single-use. Trying a guessed redirect_uri first
    // invalidates the code even when a later candidate would have matched authorize.
    const payload: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
    };
    if (redirectUri) payload.redirect_uri = redirectUri;
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
    if (body.access_token) return body.access_token;
    throw new Error(body.error_description || body.error || "GitHub token exchange failed");
  }
}

export interface OAuthState {
  redirectTo?: string;
  redirectUri?: string;
}

export function parseOAuthState(state?: string): OAuthState | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as OAuthState;
    if (!parsed || typeof parsed !== "object") return null;
    const redirectUri = typeof parsed.redirectUri === "string" ? parsed.redirectUri : undefined;
    const redirectTo = typeof parsed.redirectTo === "string" ? parsed.redirectTo : undefined;
    return { redirectTo, redirectUri };
  } catch {
    return null;
  }
}

export function createAuthProvider(): AuthProvider {
  return new GitHubAuthProvider();
}

async function githubJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "atelier" },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

export function signState(payload: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifyState(value: string, secret: string): string | null {
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const payload = value.slice(0, i);
  const mac = value.slice(i + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (mac.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? payload : null;
}
