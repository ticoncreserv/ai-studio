import type { SessionEvent } from "@atelier/contracts";
import { applyProviderCredential, credentialKeepKeys, hasProviderCredential } from "./credentials.js";
import { applyModelEnv } from "./models.js";
import { startProcessAcp } from "./process-acp.js";
import { sanitizeAgentEnv } from "./sandbox.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";
import { mcpServersFromWorktree } from "./cursor.js";

export class CodexProvider implements AgentProvider {
  capability = PROVIDER_CATALOG.find((p) => p.id === "codex")!;

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
      "codex",
      sanitizeAgentEnv(
        applyProviderCredential("codex", process.env, undefined, input.apiKey),
        credentialKeepKeys("codex"),
      ),
      input.model,
    );
    if (!hasProviderCredential("codex", env)) throw new Error("CODEX_API_KEY is not set");
    const key = env.CODEX_API_KEY?.trim();
    if (key && !env.OPENAI_API_KEY?.trim()) env.OPENAI_API_KEY = key;
    env.NO_BROWSER = "1";
    env.INITIAL_AGENT_MODE = input.mode === "ask" ? "read-only" : "agent";
    const model = input.model?.trim();
    if (model) env.CODEX_CONFIG = JSON.stringify({ model });
    return startProcessAcp({
      command: this.capability.command,
      args: [...this.capability.args],
      env,
      cwd: input.cwd,
      capability: this.capability,
      preferredAuth: ["codex-api-key", "openai-api-key"],
      resumeSessionId: input.resumeSessionId,
      sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
      mcpServers: input.mcpServers ?? mcpServersFromWorktree(input.cwd),
      model: input.model,
      onEvent: input.onEvent,
      onPermission: input.onPermission,
    });
  }
}
