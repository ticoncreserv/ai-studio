import { createHmac, timingSafeEqual } from "node:crypto";
import { mapGitHubPermission } from "@atelier/domain";
import type { Role } from "@atelier/contracts";
import { githubOAuthRedirectCandidates, hasGitHubOAuth } from "./github-app.js";

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
  id: "local" | "github";
  beginLogin(redirectTo: string, redirectUri?: string): Promise<{ url: string; state: string }>;
  completeLogin(input: Record<string, string>): Promise<AuthIdentity>;
  verifyRepoAccess(token: string, repo: string): Promise<{ role: Role | null; pending: boolean }>;
}

export class LocalAuthProvider implements AuthProvider {
  id = "local" as const;

  async beginLogin(redirectTo: string): Promise<{ url: string; state: string }> {
    return { url: `/api/auth/dev?redirect=${encodeURIComponent(redirectTo)}`, state: "dev" };
  }

  async completeLogin(input: Record<string, string>): Promise<AuthIdentity> {
    const login = (input.login || "studio").replace(/[^a-zA-Z0-9-]/g, "") || "studio";
    const locale = input.locale === "pt-BR" ? "pt-BR" : "en";
    return {
      login,
      name: input.name || login,
      email: `${login}@users.noreply.github.com`,
      locale,
      role: "owner",
      commitName: input.name || login,
      commitEmail: `${login}@users.noreply.github.com`,
    };
  }

  async verifyRepoAccess(): Promise<{ role: Role | null; pending: boolean }> {
    return { role: "owner", pending: false };
  }
}

export class GitHubAuthProvider implements AuthProvider {
  id = "github" as const;

  constructor(
    private readonly clientId = process.env.GITHUB_CLIENT_ID ?? "",
    private readonly clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "",
    private readonly repo = process.env.ATELIER_REPO ?? "ticoncreserv/app",
  ) {}

  async beginLogin(redirectTo: string, redirectUri?: string): Promise<{ url: string; state: string }> {
    const state = Buffer.from(JSON.stringify({ redirectTo, n: Date.now() })).toString("base64url");
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "read:user user:email");
    if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
    return { url: url.toString(), state };
  }

  async completeLogin(input: Record<string, string>): Promise<AuthIdentity> {
    const token = await this.exchangeCode(input.code ?? "", input.redirectUri);
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
      locale: input.locale === "pt-BR" ? "pt-BR" : "en",
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
    const attempts = [...githubOAuthRedirectCandidates(redirectUri), undefined];
    const seen = new Set<string>();
    let lastError = "GitHub token exchange failed";
    for (const uri of attempts) {
      const key = uri ?? "";
      if (seen.has(key)) continue;
      seen.add(key);
      const payload: Record<string, string> = {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
      };
      if (uri) payload.redirect_uri = uri;
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
      if (body.access_token) return body.access_token;
      lastError = body.error_description || body.error || lastError;
    }
    throw new Error(lastError);
  }
}

export function createAuthProvider(): AuthProvider {
  if (hasGitHubOAuth()) {
    return new GitHubAuthProvider();
  }
  return new LocalAuthProvider();
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
