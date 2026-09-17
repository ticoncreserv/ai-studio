import type { SessionEvent } from "@atelier/contracts";
import { applyProviderCredential, credentialKeepKeys, hasProviderCredential } from "./credentials.js";
import { applyModelEnv, modelArgs } from "./models.js";
import { startProcessAcp } from "./process-acp.js";
import { sanitizeAgentEnv } from "./sandbox.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";
import { mcpServersFromWorktree } from "./cursor.js";

export class GeminiProvider implements AgentProvider {
  capability = PROVIDER_CATALOG.find((p) => p.id === "gemini")!;

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
      "gemini",
      sanitizeAgentEnv(
        applyProviderCredential("gemini", process.env, undefined, input.apiKey),
        credentialKeepKeys("gemini"),
      ),
      input.model,
    );
    if (!hasProviderCredential("gemini", env)) throw new Error("GEMINI_API_KEY is not set");
    return startProcessAcp({
      command: this.capability.command,
      args: [...this.capability.args, ...modelArgs("gemini", input.model)],
      env,
      cwd: input.cwd,
      capability: this.capability,
      preferredAuth: ["gemini_api_key", "google_api_key"],
      resumeSessionId: input.resumeSessionId,
      sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
      mcpServers: input.mcpServers ?? mcpServersFromWorktree(input.cwd),
      model: input.model,
      onEvent: input.onEvent,
      onPermission: input.onPermission,
    });
  }
}
