import type {
  AgentMode,
  ClientCommand,
  ProviderCapability,
  SessionEvent,
  UsageSummary,
  Viewport,
} from "@atelier/contracts";

export interface StudioSession {
  id: string;
  title: string;
  provider: string;
  createdAt: string;
  events: SessionEvent[];
}

export interface StudioWorkspace {
  id: string;
  branch: string;
  status: string;
  previewToken: string;
  lastError?: string;
}

export interface PreviewDebug {
  timeMs?: number;
  queries?: number;
  memoryMb?: number;
  nPlusOne?: boolean;
}

export interface StudioPayload {
  user: { id: string; login: string; role: string; locale: "en" | "pt-BR"; platformAdmin?: boolean };
  workspace: StudioWorkspace;
  sessions: StudioSession[];
  session: StudioSession | null;
  events: SessionEvent[];
  flags: Record<string, boolean>;
  mentions: { routes: string[]; models: string[]; pages: string[] };
  recipes: Array<{ id: string; title: string; template: string; variables: string[] }>;
  skills: StudioSkill[];
  mcp: StudioMcp;
  connections: Array<{
    id: string;
    name: string;
    kind: "app" | "erp";
    env: string;
    driver: string;
    host: string;
    port?: number;
    database: string;
  }>;
  rules: Array<{ id: string; level: "platform" | "project" | "user"; title: string; body: string }>;
  providers: ProviderCapability[];
  preferredProvider: string;
  presence: Array<{ workspaceId: string; userId: string; mode: "editor" | "spectator"; at: string }>;
  lock: { sessionId: string; userId: string } | null;
  env: { env: Record<string, string>; origins?: Record<string, string> };
  userEnv: { env: Record<string, string>; raw: string; secrets?: Record<string, string> };
  worktreeEnvPath: string;
  divergence: { pendingInBranch: string[]; extraInDatabase: string[] };
  quota: { usedMb: number; limitMb: number };
  usage: UsageSummary;
  migrationLog: Array<{ id: string; author: string; branch: string; name: string; at: string; output: string }>;
  previewPath: string;
  canEdit: boolean;
  agent: { ready: boolean; provider: string; error: string | null };
}

export interface StudioAttachment {
  name: string;
  path: string;
}

export interface StudioSkill {
  name: string;
  description: string;
  source: "repo" | "platform" | "user";
  dir: string;
  paths: string[];
  manualOnly: boolean;
  icon?: string;
  color?: string;
  scope?: string;
  enabled: boolean;
  shadowed: boolean;
  issues: string[];
  editable: boolean;
  body?: string;
}

export interface StudioMcpServer {
  name: string;
  transport: "stdio" | "http" | "sse";
  source: "repo" | "platform" | "user";
  enabled: boolean;
  target: string;
  secrets: boolean;
  editable: boolean;
  shadowed: boolean;
  issues: string[];
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface StudioMcpPolicy {
  allowUserServers: boolean;
  allowedCommands: string[];
  allowedUrlPatterns: string[];
}

export interface StudioMcp {
  servers: StudioMcpServer[];
  policy: StudioMcpPolicy;
}

export type StudioAvailableCommand = { name: string; description: string; hint?: string };

export type StudioSheet = "rules" | "connections" | "settings" | "skills" | "mcp" | null;
export type StudioDialog = "share" | "invite" | "shortcuts" | "palette" | null;
export type PreviewTool = "select" | "annotate" | "comment";

export type { AgentMode, ClientCommand, SessionEvent, UsageSummary, Viewport };
