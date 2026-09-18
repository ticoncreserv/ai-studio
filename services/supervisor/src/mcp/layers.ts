import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_MCP_POLICY,
  DEFAULT_PLATFORM_MCP,
  interpolateMcp,
  mergeMcpLayers,
  mcpFingerprint,
  mcpPolicyDecision,
  parseMcpConfig,
  redactMcpEntry,
  serializeMcpConfig,
  toAcpMcpServers,
  type McpEntry,
  type McpPolicy,
  type McpSource,
} from "@atelier/domain";

export interface McpPrefs {
  userId: string;
  name: string;
  enabled: boolean;
}

const HARDCODED_BOOST = JSON.stringify({
  mcpServers: { "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] } },
});

export function mcpRoot(storeDir: string): string {
  return join(storeDir, "mcp");
}

export function globalMcpPath(storeDir: string): string {
  return join(mcpRoot(storeDir), "global.json");
}

export function userMcpPath(storeDir: string, userId: string): string {
  return join(mcpRoot(storeDir), "users", `${userId}.json`);
}

export function mcpPolicyPath(storeDir: string): string {
  return join(mcpRoot(storeDir), "policy.json");
}

export function repoMcpSnapshotPath(worktree: string): string {
  return join(worktree, "var", "atelier-mcp-repo.json");
}

export function worktreeMcpPath(worktree: string): string {
  return join(worktree, ".cursor", "mcp.json");
}

export function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function snapshotRepoMcp(worktree: string): unknown {
  const snapshot = repoMcpSnapshotPath(worktree);
  if (existsSync(snapshot)) return readJsonFile(snapshot);
  const current = worktreeMcpPath(worktree);
  const raw = existsSync(current) ? readFileSync(current, "utf8") : "";
  let parsed: unknown = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // keep the empty object when the worktree MCP file is invalid JSON
    }
  }
  const normalized = JSON.stringify(parsed);
  const repo = !raw.trim() || normalized === HARDCODED_BOOST ? { mcpServers: {} } : parsed;
  writeJsonFile(snapshot, repo);
  return repo;
}

export function readPlatformMcp(storeDir: string): McpEntry[] {
  const path = globalMcpPath(storeDir);
  if (!existsSync(path)) {
    writeJsonFile(path, DEFAULT_PLATFORM_MCP);
    return parseMcpConfig(DEFAULT_PLATFORM_MCP, "platform");
  }
  return parseMcpConfig(readJsonFile(path) ?? DEFAULT_PLATFORM_MCP, "platform");
}

export function writePlatformMcp(storeDir: string, raw: unknown): McpEntry[] {
  const entries = parseMcpConfig(raw, "platform");
  writeJsonFile(globalMcpPath(storeDir), serializeMcpConfig(entries));
  return entries;
}

export function readUserMcp(storeDir: string, userId: string): McpEntry[] {
  return parseMcpConfig(readJsonFile(userMcpPath(storeDir, userId)) ?? { mcpServers: {} }, "user");
}

export function writeUserMcp(storeDir: string, userId: string, raw: unknown): McpEntry[] {
  const entries = parseMcpConfig(raw, "user");
  writeJsonFile(userMcpPath(storeDir, userId), serializeMcpConfig(entries));
  return entries;
}

export function readMcpPolicy(storeDir: string): McpPolicy {
  const raw = readJsonFile(mcpPolicyPath(storeDir));
  if (!raw || typeof raw !== "object") {
    writeJsonFile(mcpPolicyPath(storeDir), DEFAULT_MCP_POLICY);
    return { ...DEFAULT_MCP_POLICY };
  }
  const row = raw as Partial<McpPolicy>;
  return {
    allowUserServers: row.allowUserServers !== false,
    allowedCommands: Array.isArray(row.allowedCommands) ? row.allowedCommands.map(String) : [...DEFAULT_MCP_POLICY.allowedCommands],
    allowedUrlPatterns: Array.isArray(row.allowedUrlPatterns)
      ? row.allowedUrlPatterns.map(String)
      : [...DEFAULT_MCP_POLICY.allowedUrlPatterns],
  };
}

export function writeMcpPolicy(storeDir: string, policy: McpPolicy): McpPolicy {
  const next: McpPolicy = {
    allowUserServers: Boolean(policy.allowUserServers),
    allowedCommands: policy.allowedCommands.map(String),
    allowedUrlPatterns: policy.allowedUrlPatterns.map(String),
  };
  writeJsonFile(mcpPolicyPath(storeDir), next);
  return next;
}

export function collectMcp(input: {
  worktree: string;
  storeDir: string;
  userId?: string;
  prefs?: McpPrefs[];
}): { entries: McpEntry[]; shadowed: McpEntry[] } {
  const repo = parseMcpConfig(snapshotRepoMcp(input.worktree), "repo");
  const platform = readPlatformMcp(input.storeDir);
  const user = input.userId ? readUserMcp(input.storeDir, input.userId) : [];
  const prefs = Object.fromEntries(
    (input.prefs ?? [])
      .filter((row) => !input.userId || row.userId === input.userId)
      .map((row) => [row.name, row.enabled]),
  );
  return mergeMcpLayers({ repo, platform, user }, prefs);
}

export function mergeWorktreeMcp(input: {
  worktree: string;
  storeDir: string;
  userId?: string;
  prefs?: McpPrefs[];
  policy?: McpPolicy;
  admin?: boolean;
}): { entries: McpEntry[]; written: McpEntry[] } {
  mkdirSync(join(input.worktree, ".cursor"), { recursive: true });
  const policy = input.policy ?? readMcpPolicy(input.storeDir);
  const { entries } = collectMcp(input);
  const allowed = entries.filter((entry) => mcpPolicyDecision(entry, policy, { admin: Boolean(input.admin) }) === "allow");
  const written = allowed.filter((entry) => entry.enabled);
  writeJsonFile(worktreeMcpPath(input.worktree), serializeMcpConfig(written));
  return { entries: allowed, written };
}

export function interpVars(worktree: string, env: NodeJS.ProcessEnv = process.env) {
  const folder = worktree.replace(/\\/g, "/");
  return {
    env: Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    userHome: env.HOME ?? "",
    workspaceFolder: folder,
    workspaceFolderBasename: folder.split("/").filter(Boolean).at(-1) ?? "",
    pathSeparator: "/",
  };
}

export function acpServersForWorktree(input: {
  worktree: string;
  storeDir: string;
  userId?: string;
  prefs?: McpPrefs[];
  env?: NodeJS.ProcessEnv;
  caps?: { http?: boolean; sse?: boolean };
}): ReturnType<typeof toAcpMcpServers> {
  const { written } = mergeWorktreeMcp(input);
  const vars = interpVars(input.worktree, input.env);
  return toAcpMcpServers(
    written.map((entry) => interpolateMcp(entry, vars)),
    input.caps,
  );
}

export function redactEntries(entries: McpEntry[]): McpEntry[] {
  return entries.map(redactMcpEntry);
}

export function mcpSourceLabel(source: McpSource): McpSource {
  return source;
}

export { mcpFingerprint };
