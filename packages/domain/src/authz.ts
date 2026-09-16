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

export function adminLoginsFromEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string[] {
  return (env.ATELIER_ADMIN_LOGINS ?? "")
    .split(",")
    .map((login) => login.trim())
    .filter(Boolean);
}

export function isPlatformAdmin(
  user: { login: string; role: Role; platformAdmin?: boolean },
  options: { hasExplicitAdmin: boolean; envLogins?: string[] } = { hasExplicitAdmin: false },
): boolean {
  const envLogins = options.envLogins ?? adminLoginsFromEnv();
  if (envLogins.includes(user.login)) return true;
  if (user.platformAdmin) return true;
  if (!options.hasExplicitAdmin && user.role === "owner") return true;
  return false;
}
