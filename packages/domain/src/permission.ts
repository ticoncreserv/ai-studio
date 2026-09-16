import type { PermissionDecision } from "@atelier/contracts";

const SHELL_ALLOWLIST = [
  "artisan",
  "composer",
  "npm",
  "pnpm",
  "git",
  "pint",
  "phpunit",
  "php",
];

const DESTRUCTIVE_ARTISAN = [
  "migrate:fresh",
  "migrate:rollback",
  "migrate:reset",
  "db:wipe",
  "db:seed",
];

export interface PermissionRequest {
  kind: "read" | "write" | "shell" | "network";
  path?: string;
  command?: string;
  worktree: string;
}

function canonicalPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "/" : "";
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${prefix}${parts.join("/")}`;
}

export function evaluatePermission(req: PermissionRequest): PermissionDecision {
  if (req.kind === "read" || req.kind === "write") {
    if (!req.path) return "auto-deny";
    const target = canonicalPath(req.path);
    const worktree = canonicalPath(req.worktree).replace(/\/$/, "");
    if (
      target
        .split("/")
        .some((part) => part === ".git" || part === ".env" || part.startsWith(".env."))
    ) {
      return "auto-deny";
    }
    if (target === worktree || target.startsWith(`${worktree}/`)) return "auto-allow";
    return "auto-deny";
  }

  if (req.kind === "network") return "reject-once";

  const command = (req.command ?? "").trim();
  const bin = command.split(/\s+/)[0]?.split("/").pop() ?? "";
  if (!SHELL_ALLOWLIST.includes(bin) && bin !== "php") return "reject-once";

  if (DESTRUCTIVE_ARTISAN.some((flag) => command.includes(flag))) return "auto-deny";
  if (command.includes("migrate") && !command.includes("migrate:status")) {
    return "allow-once";
  }
  return "auto-allow";
}

export function isDestructiveDatabaseCommand(command: string): boolean {
  return DESTRUCTIVE_ARTISAN.some((flag) => command.includes(flag));
}
