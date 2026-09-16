import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../paths.js";

const MAX_CHARS = 64_000;

export type PreviewLogKind = "artisan" | "vite" | "error";

export function workspaceLogsRoot(envRoot?: string): string {
  if (envRoot) return join(envRoot, "..", "logs", "workspaces");
  return join(repoRoot(), "var", "logs", "workspaces");
}

export function workspaceLogDir(workspaceId: string, envRoot?: string): string {
  return join(workspaceLogsRoot(envRoot), workspaceId);
}

function ensureDir(workspaceId: string, envRoot?: string): string {
  const dir = workspaceLogDir(workspaceId, envRoot);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function trimTail(text: string, max = MAX_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(-max);
}

export function appendPreviewLog(
  workspaceId: string,
  kind: "artisan" | "vite",
  chunk: string,
  envRoot?: string,
): void {
  if (!chunk) return;
  const dir = ensureDir(workspaceId, envRoot);
  const path = join(dir, `${kind}.log`);
  const previous = existsSync(path) ? readFileSync(path, "utf8") : "";
  writeFileSync(path, trimTail(previous + chunk));
}

export function writePreviewLogs(
  workspaceId: string,
  logs: { artisan?: string; vite?: string; error?: string },
  envRoot?: string,
): void {
  const dir = ensureDir(workspaceId, envRoot);
  if (typeof logs.artisan === "string") writeFileSync(join(dir, "artisan.log"), trimTail(logs.artisan));
  if (typeof logs.vite === "string") writeFileSync(join(dir, "vite.log"), trimTail(logs.vite));
  if (typeof logs.error === "string") {
    writeFileSync(
      join(dir, "error.json"),
      JSON.stringify({ at: new Date().toISOString(), message: logs.error }, null, 2),
    );
  }
}

export function readPreviewLogs(
  workspaceId: string,
  envRoot?: string,
): { artisan: string; vite: string; error: string | null; errorAt: string | null } {
  const dir = workspaceLogDir(workspaceId, envRoot);
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "");
  let error: string | null = null;
  let errorAt: string | null = null;
  const errorPath = join(dir, "error.json");
  if (existsSync(errorPath)) {
    try {
      const parsed = JSON.parse(readFileSync(errorPath, "utf8")) as { message?: string | null; at?: string; cleared?: boolean };
      error = parsed.cleared || parsed.message == null ? null : parsed.message ?? null;
      errorAt = parsed.cleared ? null : parsed.at ?? null;
    } catch {
      error = readFileSync(errorPath, "utf8");
    }
  }
  return {
    artisan: read("artisan.log"),
    vite: read("vite.log"),
    error,
    errorAt,
  };
}

export function clearPreviewError(workspaceId: string, envRoot?: string): void {
  const dir = ensureDir(workspaceId, envRoot);
  writeFileSync(
    join(dir, "error.json"),
    JSON.stringify({ at: new Date().toISOString(), message: null, cleared: true }, null, 2),
  );
}

export type PreviewFixHint = {
  id: string;
  title: string;
  detail: string;
  action?: "resume" | "hibernate" | "destroy" | "openEnv" | "openWorkspace";
};

export function suggestPreviewFixes(message: string, logs = ""): PreviewFixHint[] {
  const hay = `${message}\n${logs}`.toLowerCase();
  const hints: PreviewFixHint[] = [];
  const push = (hint: PreviewFixHint) => {
    if (!hints.some((row) => row.id === hint.id)) hints.push(hint);
  };

  if (/enospc|no space left|watch.*limit|inotify/i.test(hay)) {
    push({
      id: "enospc",
      title: "File watcher limit",
      detail: "Vite or PHP hit the OS watch limit. Resume after raising fs.inotify.max_user_watches, or hibernate idle clones.",
      action: "resume",
    });
  }
  if (/vite did not start|manifest\.json|hot file|@vite\/client/i.test(hay)) {
    push({
      id: "vite",
      title: "Vite failed to boot",
      detail: "Confirm node_modules/.bin/vite exists in the clone, then retry the preview. A fresh resume rewrites the atelier Vite config.",
      action: "resume",
    });
  }
  if (/did not become healthy|\/up|artisan serve|php 8\.5/i.test(hay)) {
    push({
      id: "artisan",
      title: "Laravel /up never answered",
      detail: "Inspect the artisan log for boot errors. Homologation DB hosts that hang can block artisan; isolation env should force local sqlite for CLI.",
      action: "resume",
    });
  }
  if (/composer|vendor\/autoload|class .* not found/i.test(hay)) {
    push({
      id: "composer",
      title: "PHP dependencies missing",
      detail: "The clone may be missing vendor/. Reprovision or run composer install inside the worktree, then retry.",
      action: "resume",
    });
  }
  if (/cursor_api_key|permission_denied|agent failed|mcpServers/i.test(hay)) {
    push({
      id: "cursor",
      title: "Cursor agent credentials",
      detail: "Open Environment / Providers and confirm CURSOR_API_KEY. MCP env must be an array for session/new.",
      action: "openEnv",
    });
  }
  if (/eisdir|illegal operation on a directory/i.test(hay)) {
    push({
      id: "eisdir",
      title: "Agent tried to read a directory",
      detail: "Usually a stale prompt against a folder path. Retry a narrower ask, or clear the errored session and start a new one.",
      action: "openWorkspace",
    });
  }
  if (/10\.0\.|homolog|syn_sent|connection timed out|sqlstate/i.test(hay)) {
    push({
      id: "homolog",
      title: "Homologation hosts unreachable",
      detail: "10.x DB hosts are expected to time out outside the VPN. Preview /up should still work; screens needing MySQL will fail until those hosts answer.",
    });
  }
  if (/docker is not available|atelier_runtime=docker/i.test(hay)) {
    push({
      id: "docker",
      title: "Docker runtime unavailable",
      detail: "Set ATELIER_RUNTIME=process (default) when the Docker daemon is not present on this host.",
      action: "openEnv",
    });
  }
  if (!hints.length) {
    push({
      id: "retry",
      title: "Retry the preview",
      detail: "Clear ports with hibernate if needed, then resume. Read the artisan/Vite logs for the exact stack.",
      action: "resume",
    });
  }
  return hints;
}
