import type { SessionEvent } from "@atelier/contracts";
import { applyProviderCredential, credentialKeepKeys, hasProviderCredential } from "./credentials.js";
import { startProcessAcp } from "./process-acp.js";
import { sanitizeAgentEnv } from "./sandbox.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";
import { mcpServersFromWorktree } from "./cursor.js";

export class GrokProvider implements AgentProvider {
  capability = PROVIDER_CATALOG.find((p) => p.id === "grok")!;

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
    const env = sanitizeAgentEnv(applyProviderCredential("grok", process.env), credentialKeepKeys("grok"));
    if (!hasProviderCredential("grok", env)) throw new Error("XAI_API_KEY is not set");
    return startProcessAcp({
      command: this.capability.command,
      args: ["--no-auto-update", "agent", "stdio"],
      env,
      cwd: input.cwd,
      capability: this.capability,
      preferredAuth: ["xai.api_key", "cached_token"],
      resumeSessionId: input.resumeSessionId,
      sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
      mcpServers: input.mcpServers ?? mcpServersFromWorktree(input.cwd),
      onEvent: input.onEvent,
      onPermission: input.onPermission,
    });
  }
}
