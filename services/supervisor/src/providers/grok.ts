import type { SessionEvent } from "@atelier/contracts";
import { applyProviderCredential, credentialKeepKeys, hasProviderCredential } from "./credentials.js";
import { applyModelEnv, modelArgs } from "./models.js";
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
    apiKey?: string;
    model?: string;
    onPermission?: (event: SessionEvent, rpcId: number) => void;
  }): Promise<ProviderRun> {
    const env = applyModelEnv(
      "grok",
      sanitizeAgentEnv(applyProviderCredential("grok", process.env, undefined, input.apiKey), credentialKeepKeys("grok")),
      input.model,
    );
    if (!hasProviderCredential("grok", env)) throw new Error("XAI_API_KEY is not set");
    return startProcessAcp({
      command: this.capability.command,
      // Agent options go after `agent` and before the transport name.
      args: ["--no-auto-update", "agent", ...modelArgs("grok", input.model), "stdio"],
      env,
      cwd: input.cwd,
      capability: this.capability,
      preferredAuth: ["xai.api_key", "cached_token"],
      resumeSessionId: input.resumeSessionId,
      sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
      mcpServers: input.mcpServers ?? mcpServersFromWorktree(input.cwd),
      model: input.model,
      onEvent: input.onEvent,
      onPermission: input.onPermission,
    });
  }
}
