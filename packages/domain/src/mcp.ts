export type McpSource = "repo" | "platform" | "user";
export type McpTransport = "stdio" | "http" | "sse";

export type McpServerConfig =
  | { transport: "stdio"; command: string; args: string[]; env: Record<string, string>; envFile?: string }
  | { transport: "http" | "sse"; url: string; headers: Record<string, string> };

export interface McpEntry {
  name: string;
  source: McpSource;
  enabled: boolean;
  config: McpServerConfig;
  extra: Record<string, unknown>;
  issues: string[];
}

export interface McpPolicy {
  allowUserServers: boolean;
  allowedCommands: string[];
  allowedUrlPatterns: string[];
}

export interface McpInterpVars {
  env: Record<string, string>;
  userHome: string;
  workspaceFolder: string;
  workspaceFolderBasename: string;
  pathSeparator: string;
}

export interface AcpMcpServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Array<{ name: string; value: string }>;
  type?: "http" | "sse";
  url?: string;
  headers?: Array<{ name: string; value: string }>;
}

export const DEFAULT_MCP_POLICY: McpPolicy = {
  allowUserServers: true,
  allowedCommands: ["php", "npx", "node", "python", "python3", "uvx", "docker"],
  allowedUrlPatterns: ["https://"],
};

export const DEFAULT_PLATFORM_MCP: Record<string, unknown> = {
  mcpServers: {
    "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] },
  },
};

export const REDACTED_MCP_VALUE = "••••";

export function isSecretMcpKey(key: string): boolean {
  return /password|secret|token|key|private|authorization/i.test(key) && !key.endsWith("_NAME");
}

export function parseMcpConfig(raw: unknown, source: McpSource, enabledByDefault = true): McpEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const servers = (raw as { mcpServers?: Record<string, unknown> }).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  return Object.entries(servers).map(([name, value]) => parseMcpServer(name, value, source, enabledByDefault));
}

export function parseMcpServer(name: string, value: unknown, source: McpSource, enabled = true): McpEntry {
  const issues: string[] = [];
  const extra: Record<string, unknown> = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  if (!name.trim()) issues.push("Server name is required.");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      name,
      source,
      enabled,
      config: { transport: "stdio", command: "", args: [], env: {} },
      extra: {},
      issues: [...issues, "Server config must be an object."],
    };
  }
  const row = value as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : undefined;
  const url = typeof row.url === "string" ? row.url : "";
  const command = typeof row.command === "string" ? row.command : "";
  if (url || type === "http" || type === "sse") {
    const transport: "http" | "sse" = type === "sse" || type === "http" ? type : "http";
    if (!url) issues.push("Remote MCP servers need a url.");
    delete extra.command;
    delete extra.args;
    delete extra.env;
    delete extra.envFile;
    return {
      name,
      source,
      enabled,
      config: { transport, url, headers: stringMap(row.headers) },
      extra,
      issues,
    };
  }
  if (!command) issues.push("stdio MCP servers need a command.");
  delete extra.url;
  delete extra.headers;
  return {
    name,
    source,
    enabled,
    config: {
      transport: "stdio",
      command,
      args: stringList(row.args),
      env: stringMap(row.env),
      envFile: typeof row.envFile === "string" ? row.envFile : undefined,
    },
    extra,
    issues,
  };
}

export function mergeMcpLayers(
  layers: { repo: McpEntry[]; platform: McpEntry[]; user: McpEntry[] },
  prefs: Record<string, boolean> = {},
): { entries: McpEntry[]; shadowed: McpEntry[] } {
  const rank: Record<McpSource, number> = { repo: 0, user: 1, platform: 2 };
  const all = [...layers.repo, ...layers.user, ...layers.platform].sort((a, b) => rank[a.source] - rank[b.source]);
  const byName = new Map<string, McpEntry>();
  const shadowed: McpEntry[] = [];
  for (const entry of all) {
    const existing = byName.get(entry.name);
    if (existing) {
      shadowed.push(entry);
      continue;
    }
    const enabled = prefs[entry.name] ?? entry.enabled;
    byName.set(entry.name, { ...entry, enabled });
  }
  return { entries: [...byName.values()], shadowed };
}

export function interpolateMcp(entry: McpEntry, vars: McpInterpVars): McpEntry {
  const config = entry.config;
  if (config.transport === "stdio") {
    return {
      ...entry,
      config: {
        ...config,
        command: interpolateValue(config.command, vars),
        args: config.args.map((arg) => interpolateValue(arg, vars)),
        env: Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, interpolateValue(value, vars)])),
        envFile: config.envFile ? interpolateValue(config.envFile, vars) : undefined,
      },
    };
  }
  return {
    ...entry,
    config: {
      ...config,
      url: interpolateValue(config.url, vars),
      headers: Object.fromEntries(Object.entries(config.headers).map(([key, value]) => [key, interpolateValue(value, vars)])),
    },
  };
}

export function interpolateValue(value: string, vars: McpInterpVars): string {
  return value
    .replaceAll("${userHome}", vars.userHome)
    .replaceAll("${workspaceFolder}", vars.workspaceFolder)
    .replaceAll("${workspaceFolderBasename}", vars.workspaceFolderBasename)
    .replaceAll("${pathSeparator}", vars.pathSeparator)
    .replaceAll("${/}", vars.pathSeparator)
    .replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => vars.env[name] ?? "");
}

export function toAcpMcpServers(
  entries: McpEntry[],
  caps: { http?: boolean; sse?: boolean } = {},
): AcpMcpServer[] {
  const out: AcpMcpServer[] = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    if (entry.config.transport === "stdio") {
      if (!entry.config.command) continue;
      out.push({
        name: entry.name,
        command: entry.config.command,
        args: entry.config.args,
        env: envToAcpList(entry.config.env),
      });
      continue;
    }
    if (entry.config.transport === "http" && !caps.http) continue;
    if (entry.config.transport === "sse" && !caps.sse) continue;
    out.push({
      type: entry.config.transport,
      name: entry.name,
      url: entry.config.url,
      headers: envToAcpList(entry.config.headers),
    });
  }
  return out;
}

export function envToAcpList(env: unknown): Array<{ name: string; value: string }> {
  if (Array.isArray(env)) {
    return env
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as { name?: unknown; value?: unknown };
        if (typeof item.name !== "string" || !item.name) return null;
        return { name: item.name, value: typeof item.value === "string" ? item.value : String(item.value ?? "") };
      })
      .filter((row): row is { name: string; value: string } => Boolean(row));
  }
  if (env && typeof env === "object") {
    return Object.entries(env as Record<string, unknown>).map(([name, value]) => ({
      name,
      value: typeof value === "string" ? value : String(value ?? ""),
    }));
  }
  return [];
}

export function mcpPolicyDecision(
  entry: McpEntry,
  policy: McpPolicy,
  actor: { admin: boolean },
): "allow" | "deny" {
  if (actor.admin || entry.source !== "user") return "allow";
  if (!policy.allowUserServers) return "deny";
  const config = entry.config;
  if (config.transport === "stdio") {
    const command = basenameCommand(config.command);
    if (!command) return "deny";
    return policy.allowedCommands.some((pattern) => commandMatches(command, pattern)) ? "allow" : "deny";
  }
  return policy.allowedUrlPatterns.some((pattern) => urlMatches(config.url, pattern)) ? "allow" : "deny";
}

export function redactMcpEntry(entry: McpEntry): McpEntry {
  const config = entry.config;
  if (config.transport === "stdio") {
    return {
      ...entry,
      config: {
        ...config,
        env: redactMap(config.env),
      },
    };
  }
  return {
    ...entry,
    config: {
      ...config,
      headers: redactMap(config.headers),
    },
  };
}

export function restoreRedactedMcp(
  incoming: Record<string, string>,
  current: Record<string, string>,
): Record<string, string> {
  const out = { ...incoming };
  for (const [key, value] of Object.entries(out)) {
    if (value === REDACTED_MCP_VALUE) out[key] = current[key] ?? "";
  }
  return out;
}

export function serializeMcpConfig(entries: McpEntry[]): { mcpServers: Record<string, unknown> } {
  const mcpServers: Record<string, unknown> = {};
  for (const entry of entries) {
    mcpServers[entry.name] = mcpServerJson(entry);
  }
  return { mcpServers };
}

export function mcpServerJson(entry: McpEntry): Record<string, unknown> {
  const known = new Set(["type", "command", "args", "env", "envFile", "url", "headers"]);
  const extra = Object.fromEntries(Object.entries(entry.extra).filter(([key]) => !known.has(key)));
  const config = entry.config;
  if (config.transport === "stdio") {
    const row: Record<string, unknown> = { ...extra, command: config.command };
    if (config.args.length) row.args = config.args;
    if (Object.keys(config.env).length) row.env = config.env;
    if (config.envFile) row.envFile = config.envFile;
    return row;
  }
  const row: Record<string, unknown> = { ...extra, type: config.transport, url: config.url };
  if (Object.keys(config.headers).length) row.headers = config.headers;
  return row;
}

export function mcpFingerprint(entries: McpEntry[]): string {
  return JSON.stringify(
    entries
      .filter((entry) => entry.enabled)
      .map((entry) => [entry.name, entry.source, entry.config])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

function redactMap(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = isSecretMcpKey(key) ? REDACTED_MCP_VALUE : value;
  }
  return out;
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    for (const row of envToAcpList(value)) out[row.name] = row.value;
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item == null) continue;
      out[key] = typeof item === "string" ? item : String(item);
    }
  }
  return out;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function basenameCommand(command: string): string {
  const trimmed = command.trim().split(/[/\\]/).pop() ?? "";
  return trimmed;
}

function commandMatches(command: string, pattern: string): boolean {
  if (pattern === "*" || pattern === command) return true;
  if (pattern.endsWith("*")) return command.startsWith(pattern.slice(0, -1));
  return command === pattern;
}

function urlMatches(url: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern.endsWith("*")) return url.startsWith(pattern.slice(0, -1));
  return url.startsWith(pattern);
}
