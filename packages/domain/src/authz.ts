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
