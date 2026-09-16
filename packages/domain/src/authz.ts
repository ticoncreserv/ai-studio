import type { Role } from "@atelier/contracts";

export function mapGitHubPermission(permissions: {
  admin?: boolean;
  maintain?: boolean;
  push?: boolean;
  triage?: boolean;
  pull?: boolean;
} | null): Role | null {
  if (!permissions) return null;
  if (permissions.admin || permissions.maintain) return "owner";
  if (permissions.push) return "editor";
  if (permissions.triage || permissions.pull) return "viewer";
  return null;
}

export function canEdit(role: Role): boolean {
  return role === "owner" || role === "editor";
}

export function canInvite(role: Role): boolean {
  return role === "owner";
}

export function canSpectate(role: Role): boolean {
  return role === "owner" || role === "editor" || role === "viewer";
}

export const FALLBACK_REPO_OWNER_LOGIN = "ticoncreserv";

export function adminLoginsFromEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string[] {
  return (env.ATELIER_ADMIN_LOGINS ?? "")
    .split(",")
    .map((login) => login.trim())
    .filter(Boolean);
}

export function sameLogin(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function isRepoOwnerLogin(login: string, repoOwnerLogin = FALLBACK_REPO_OWNER_LOGIN): boolean {
  return sameLogin(login, repoOwnerLogin);
}

/** Hard-fallback `ticoncreserv`, or the stored GitHub App owner when that account is `ticoncreserv`. */
export function isPermanentPlatformAdmin(login: string, repoOwnerLogin = FALLBACK_REPO_OWNER_LOGIN): boolean {
  if (sameLogin(login, FALLBACK_REPO_OWNER_LOGIN)) return true;
  const stored = repoOwnerLogin.trim();
  return Boolean(stored) && sameLogin(stored, FALLBACK_REPO_OWNER_LOGIN) && sameLogin(login, stored);
}

export function isPlatformAdmin(
  user: { login: string; role: Role; platformAdmin?: boolean },
  options: { envLogins?: string[]; repoOwnerLogin?: string; hasExplicitAdmin?: boolean } = {},
): boolean {
  const envLogins = options.envLogins ?? adminLoginsFromEnv();
  if (isPermanentPlatformAdmin(user.login, options.repoOwnerLogin)) return true;
  if (envLogins.some((login) => sameLogin(login, user.login))) return true;
  return user.platformAdmin === true;
}
