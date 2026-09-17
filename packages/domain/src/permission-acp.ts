import type { PermissionRequest } from "./permission.js";

export function permissionRequestFromTitle(title: string, worktree: string): PermissionRequest {
  const trimmed = title.trim();
  const pathMatch = trimmed.match(/(\/[^\s:]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)/);
  const lower = trimmed.toLowerCase();
  if (/\b(write|edit|create|delete|read|open)\b/.test(lower) && pathMatch) {
    const path = pathMatch[1]!.startsWith("/") ? pathMatch[1]! : `${worktree.replace(/\/$/, "")}/${pathMatch[1]}`;
    return {
      kind: /\b(write|edit|create|delete)\b/.test(lower) ? "write" : "read",
      path,
      worktree,
    };
  }
  if (/\bhttps?:\/\//i.test(trimmed) || lower.includes("network") || lower.includes("fetch")) {
    return { kind: "network", command: trimmed, worktree };
  }
  return { kind: "shell", command: trimmed, worktree };
}
