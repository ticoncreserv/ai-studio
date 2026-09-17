import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxProfile, SessionEvent } from "@atelier/contracts";
import { parseMcpConfig, toAcpMcpServers as entriesToAcp, type AcpMcpServer } from "@atelier/domain";
import { cursorAgentEnv, cursorProbeHome } from "./env.js";
import { ensureCursorAgent } from "./ensure-agent.js";
import { applyProviderCredential, credentialKeepKeys } from "./credentials.js";
import { applyModelEnv, modelArgs } from "./models.js";
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

export function cursorAcpArgs(mode?: "agent" | "plan" | "ask", model?: string, apiKey?: string): string[] {
  const args: string[] = [];
  const key = apiKey?.trim();
  if (key) args.push("--api-key", key);
  args.push("--trust");
  if (mode === "plan" || mode === "ask") args.push("--mode", mode);
  args.push(...modelArgs("cursor", model));
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
    apiKey?: string;
    home?: string;
    model?: string;
    onPermission?: (event: SessionEvent, rpcId: number) => void;
  }): Promise<ProviderRun> {
    const apiKey = input.apiKey?.trim() || undefined;
    const home = input.home?.trim() || (apiKey ? cursorProbeHome() : undefined);
    if (!apiKey && !home) throw new Error("No Cursor CLI account or API key is configured");
    const raw = cursorAgentEnv(process.env, { home, apiKey: apiKey ?? false });
    const keep = apiKey ? credentialKeepKeys("cursor") : [];
    const env = applyModelEnv(
      "cursor",
      sanitizeAgentEnv(apiKey ? applyProviderCredential("cursor", raw, undefined, apiKey) : raw, keep),
      input.model,
    );
    const command = await ensureCursorAgent({ env });
    return startProcessAcp({
      command,
      args: cursorAcpArgs(input.mode, input.model, apiKey),
      env,
      cwd: input.cwd,
      capability: this.capability,
      resumeSessionId: input.resumeSessionId,
      sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
      mcpServers: input.mcpServers ?? mcpServersFromWorktree(input.cwd),
      model: input.model,
      onEvent: input.onEvent,
      onPermission: input.onPermission,
    });
  }
}
