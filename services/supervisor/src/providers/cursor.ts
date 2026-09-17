import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxProfile, SessionEvent } from "@atelier/contracts";
import { parseMcpConfig, toAcpMcpServers as entriesToAcp, type AcpMcpServer } from "@atelier/domain";
import { cursorAgentEnv, hasCursorApiKey } from "./env.js";
import { ensureCursorAgent } from "./ensure-agent.js";
import { applyProviderCredential, credentialKeepKeys } from "./credentials.js";
import { startProcessAcp } from "./process-acp.js";
import { sanitizeAgentEnv } from "./sandbox.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";

export type { AcpMcpServer };

export function toAcpMcpServers(raw: unknown, caps?: { http?: boolean; sse?: boolean }): AcpMcpServer[] {
  return entriesToAcp(parseMcpConfig(raw, "repo"), caps);
}

export function mcpServersFromWorktree(cwd: string): AcpMcpServer[] {
  const file = join(cwd, ".cursor", "mcp.json");
  if (!existsSync(file)) return [];
  try {
    return toAcpMcpServers(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return [];
  }
}

function cursorArgs(mode?: "agent" | "plan" | "ask"): string[] {
  const args = ["--trust"];
  if (mode === "plan" || mode === "ask") args.push("--mode", mode);
  args.push("acp");
  return args;
}

export class CursorProvider implements AgentProvider {
  capability = PROVIDER_CATALOG.find((p) => p.id === "cursor")!;

  async start(input: {
    cwd: string;
    onEvent: (event: SessionEvent) => void;
    resumeSessionId?: string;
    mode?: "agent" | "plan" | "ask";
    sandbox?: boolean;
    sandboxProfile?: SandboxProfile;
    mcpServers?: AcpMcpServer[];
    onPermission?: (event: SessionEvent, rpcId: number) => void;
  }): Promise<ProviderRun> {
    const env = sanitizeAgentEnv(applyProviderCredential("cursor", cursorAgentEnv()), credentialKeepKeys("cursor"));
    if (!hasCursorApiKey(env)) throw new Error("CURSOR_API_KEY is not set");
    const command = await ensureCursorAgent({ env });
    return startProcessAcp({
      command,
      args: cursorArgs(input.mode),
      env,
      cwd: input.cwd,
      capability: this.capability,
      preferredAuth: ["cursor_login"],
      resumeSessionId: input.resumeSessionId,
      sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
      mcpServers: input.mcpServers ?? mcpServersFromWorktree(input.cwd),
      onEvent: input.onEvent,
      onPermission: input.onPermission,
    });
  }
}
