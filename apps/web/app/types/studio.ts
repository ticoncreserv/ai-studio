import type { AgentMode, ClientCommand, ProviderCapability, SessionEvent, Viewport } from "@atelier/contracts";

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

export interface StudioPayload {
  user: { id: string; login: string; role: string; locale: "en" | "pt-BR" };
  workspace: StudioWorkspace;
  sessions: StudioSession[];
  session: StudioSession | null;
  events: SessionEvent[];
  flags: Record<string, boolean>;
  mentions: { routes: string[]; models: string[]; pages: string[] };
  recipes: Array<{ id: string; title: string; template: string; variables: string[] }>;
  connections: Array<{
    id: string;
    name: string;
    kind: "app" | "erp";
    env: string;
    driver: string;
    host: string;
    database: string;
  }>;
  rules: Array<{ id: string; level: "platform" | "project" | "user"; title: string; body: string }>;
  providers: ProviderCapability[];
  preferredProvider: string;
  presence: Array<{ workspaceId: string; userId: string; mode: "editor" | "spectator"; at: string }>;
  lock: { sessionId: string; userId: string } | null;
  env: { env: Record<string, string> };
  divergence: { pendingInBranch: string[]; extraInDatabase: string[] };
  quota: { usedMb: number; limitMb: number };
  migrationLog: Array<{ id: string; author: string; branch: string; name: string; at: string; output: string }>;
  previewPath: string;
}

export interface StudioAttachment {
  name: string;
  path: string;
}

export type StudioSheet = "rules" | "connections" | "settings" | null;
export type StudioDialog = "share" | "invite" | "shortcuts" | "palette" | null;
export type PreviewTool = "select" | "annotate" | "comment";

export type { AgentMode, ClientCommand, SessionEvent, Viewport };
