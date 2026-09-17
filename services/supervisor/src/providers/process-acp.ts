import type { ProviderCapability, SandboxProfile, SessionEvent } from "@atelier/contracts";
import {
  configOptionId,
  currentModelId,
  findModelOption,
  modelOptionValues,
  resolveModelValue,
} from "../acp/config-options.js";
import { eventsFromAcpUpdate, permissionFromAcp } from "../acp/events.js";
import { AcpSession, selectAuthMethod, type AcpPromptBlock } from "../acp/session.js";
import { wrapSandbox } from "./sandbox.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import type { AcpMcpServer } from "@atelier/domain";

export interface ProcessAcpLaunch {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  capability: ProviderCapability;
  preferredAuth?: string[];
  resumeSessionId?: string;
  sandboxProfile?: SandboxProfile;
  mcpServers?: AcpMcpServer[];
  /** Admin-pinned model. Applied over ACP when the agent advertises the option. */
  model?: string;
  onEvent: (event: SessionEvent) => void;
  onPermission?: (event: SessionEvent, rpcId: number) => void;
}

export async function startProcessAcp(input: ProcessAcpLaunch): Promise<ProviderRun> {
  const launched = wrapSandbox(
    input.command,
    input.args,
    input.cwd,
    input.sandboxProfile ?? "disabled",
    input.env,
  );
  const acp = new AcpSession(
    launched.command,
    launched.args,
    (msg) => {
      for (const event of eventsFromAcpUpdate(msg)) input.onEvent(event);
    },
    (id, params) => {
      const event = permissionFromAcp(params, id);
      if (input.onPermission) input.onPermission(event, id);
      else acp.respond(id, { outcome: { outcome: "selected", optionId: "reject-once" } });
    },
  );
  acp.start(input.env, input.cwd);
  await acp.initialize();
  const method = selectAuthMethod(acp.authMethods, input.preferredAuth, input.env);
  if (method) await acp.authenticate(method, { _meta: { headless: true } });
  const caps = acp.capabilities?.mcpCapabilities ?? {};
  const servers = (input.mcpServers ?? []).filter((server) => {
    if (server.type === "http") return Boolean(caps.http);
    if (server.type === "sse") return Boolean(caps.sse);
    return Boolean(server.command);
  });
  if (input.resumeSessionId && acp.capabilities?.loadSession !== false) {
    try {
      await acp.loadSession(input.resumeSessionId, input.cwd, servers);
    } catch {
      await acp.newSession(input.cwd, servers);
    }
  } else {
    await acp.newSession(input.cwd, servers);
  }
  await applyModelOption(acp, input.model);
  const modelOption = findModelOption(acp.configOptions);
  return {
    acpSessionId: acp.sessionId ?? undefined,
    models: modelOptionValues(modelOption),
    modelId: currentModelId(modelOption),
    prompt: async (blocks: AcpPromptBlock[]) => {
      await acp.prompt(blocks);
    },
    cancel: () => acp.cancel(),
    stop: () => acp.stop(),
    respondPermission: (rpcId, outcome) => {
      acp.respond(rpcId, { outcome: { outcome: "selected", optionId: outcome } });
    },
  };
}

/**
 * Pins the admin default over ACP. Agents that do not advertise a model option keep
 * whatever the launch flag or env var already selected, so a rejection is not fatal.
 */
async function applyModelOption(acp: AcpSession, model?: string): Promise<void> {
  const wanted = model?.trim();
  if (!wanted) return;
  const option = findModelOption(acp.configOptions);
  if (!option) return;
  const value = resolveModelValue(option, wanted);
  if (currentModelId(option) === value) return;
  try {
    await acp.setConfigOption(configOptionId(option), value);
  } catch (error) {
    console.warn("[atelier] agent rejected model", value, error instanceof Error ? error.message : error);
  }
}

export function processAcpProvider(
  capability: ProviderCapability,
  launch: (input: {
    cwd: string;
    mode?: "agent" | "plan" | "ask";
    env: NodeJS.ProcessEnv;
  }) => Promise<{ command: string; args: string[]; env: NodeJS.ProcessEnv; preferredAuth?: string[] }>,
): AgentProvider {
  return {
    capability,
    async start(input) {
      const resolved = await launch({ cwd: input.cwd, mode: input.mode, env: process.env });
      return startProcessAcp({
        ...resolved,
        cwd: input.cwd,
        capability,
        resumeSessionId: input.resumeSessionId,
        sandboxProfile: input.sandboxProfile ?? (input.sandbox ? "best-effort" : "disabled"),
        mcpServers: input.mcpServers,
        model: input.model,
        onEvent: input.onEvent,
        onPermission: input.onPermission,
      });
    },
  };
}
