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

export function evaluatePermission(req: PermissionRequest): PermissionDecision {
  if (req.kind === "read" || req.kind === "write") {
    if (!req.path) return "auto-deny";
    const normalized = req.path.replace(/\\/g, "/");
    if (normalized.includes(".env")) return "auto-deny";
    if (normalized.startsWith(req.worktree.replace(/\\/g, "/"))) return "auto-allow";
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
