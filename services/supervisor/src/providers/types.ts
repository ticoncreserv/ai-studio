import type { ProviderCapability, ProviderModel, SandboxProfile, SessionEvent } from "@atelier/contracts";
import type { AcpPromptBlock } from "../acp/session.js";

export interface ProviderRun {
  prompt: (blocks: AcpPromptBlock[]) => Promise<void>;
  cancel: () => Promise<void>;
  stop: () => void;
  acpSessionId?: string;
  /** Models the agent advertised, used to keep the admin picker honest. */
  models?: ProviderModel[];
  modelId?: string;
  respondPermission?: (rpcId: number, outcome: "allow-once" | "allow-always" | "reject-once") => void;
}

export interface AgentProvider {
  capability: ProviderCapability;
  start(input: {
    cwd: string;
    onEvent: (event: SessionEvent) => void;
    resumeSessionId?: string;
    mode?: "agent" | "plan" | "ask";
    sandbox?: boolean;
    sandboxProfile?: SandboxProfile;
    mcpServers?: Array<{ name: string; command?: string; args?: string[]; env?: Array<{ name: string; value: string }>; type?: "http" | "sse"; url?: string; headers?: Array<{ name: string; value: string }> }>;
    /** One key from the provider's pool. Omitted means the first stored key. */
    apiKey?: string;
    /** Isolated Cursor CLI HOME. Omitted on API-key runs. */
    home?: string;
    /** Admin-pinned default model. Omitted means the agent's own default. */
    model?: string;
    onPermission?: (event: SessionEvent, rpcId: number) => void;
  }): Promise<ProviderRun>;
}

export const PROVIDER_CATALOG: ProviderCapability[] = [
  {
    id: "cursor",
    label: "Cursor",
    command: "agent",
    args: ["acp"],
    modes: ["agent", "plan", "ask"],
    images: true,
    todos: true,
    plans: true,
    questions: true,
  },
  {
    id: "codex",
    label: "Codex",
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp"],
    modes: ["agent", "ask"],
    images: true,
    todos: true,
    plans: false,
    questions: true,
  },
  {
    id: "claude",
    label: "Claude",
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    modes: ["agent", "plan", "ask"],
    images: true,
    todos: true,
    plans: true,
    questions: true,
  },
  {
    id: "gemini",
    label: "Gemini",
    command: "gemini",
    args: ["--acp"],
    modes: ["agent", "ask"],
    images: true,
    todos: false,
    plans: false,
    questions: false,
  },
  {
    id: "grok",
    label: "Grok",
    command: "grok",
    args: ["agent", "stdio"],
    modes: ["agent", "ask"],
    images: true,
    todos: false,
    plans: false,
    questions: false,
  },
  {
    id: "mock",
    label: "Mock",
    command: "mock",
    args: [],
    modes: ["agent", "plan", "ask"],
    images: true,
    todos: true,
    plans: true,
    questions: true,
  },
];
