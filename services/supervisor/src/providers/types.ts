import type { ProviderCapability } from "@atelier/contracts";
import type { AcpPromptBlock } from "../acp/session.js";
import type { SessionEvent } from "@atelier/contracts";

export interface ProviderRun {
  prompt: (blocks: AcpPromptBlock[]) => Promise<void>;
  cancel: () => Promise<void>;
  stop: () => void;
  acpSessionId?: string;
  respondPermission?: (rpcId: number, outcome: "allow-once" | "allow-always" | "reject-once") => void;
}

export interface AgentProvider {
  capability: ProviderCapability;
  start(input: {
    cwd: string;
    onEvent: (event: SessionEvent) => void;
    resumeSessionId?: string;
    mode?: "agent" | "plan" | "ask";
    mcpServers?: Array<{ name: string; command: string; args?: string[] }>;
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
