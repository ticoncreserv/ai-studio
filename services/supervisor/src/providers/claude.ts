import type { SessionEvent } from "@atelier/contracts";
import { applyProviderCredential, credentialKeepKeys, hasProviderCredential } from "./credentials.js";
import { startProcessAcp } from "./process-acp.js";
import { sanitizeAgentEnv } from "./sandbox.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";
import { mcpServersFromWorktree } from "./cursor.js";

export class ClaudeProvider implements AgentProvider {
  capability = PROVIDER_CATALOG.find((p) => p.id === "claude")!;

  async start(input: {
    cwd: string;
    onEvent: (event: SessionEvent) => void;
    resumeSessionId?: string;
    mode?: "agent" | "plan" | "ask";
    sandbox?: boolean;
    sandboxProfile?: import("@atelier/contracts").SandboxProfile;
    mcpServers?: Parameters<typeof startProcessAcp>[0]["mcpServers"];
    onPermission?: (event: SessionEvent, rpcId: number) => void;
  }): Promise<ProviderRun> {
    const env = sanitizeAgentEnv(applyProviderCredential("claude", process.env), credentialKeepKeys("claude"));
    if (!hasProviderCredential("claude", env)) throw new Error("ANTHROPIC_API_KEY is not set");
    const args = [...this.capability.args];
    if (input.mode === "plan" || input.mode === "ask") args.push("--mode", input.mode);
    return startProcessAcp({
      command: this.capability.command,
      args,
      env,
      cwd: input.cwd,
      capability: this.capability,
      preferredAuth: ["anthropic_api_key", "api_key"],
      resumeSessionId: input.resumeSessionId,
      sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
      mcpServers: input.mcpServers ?? mcpServersFromWorktree(input.cwd),
      onEvent: input.onEvent,
      onPermission: input.onPermission,
    });
  }
}
