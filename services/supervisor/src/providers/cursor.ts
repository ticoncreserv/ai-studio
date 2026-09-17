import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionEvent } from "@atelier/contracts";
import { parseMcpConfig, toAcpMcpServers as entriesToAcp, type AcpMcpServer } from "@atelier/domain";
import { AcpSession } from "../acp/session.js";
import { eventsFromAcpUpdate, permissionFromAcp } from "../acp/events.js";
import { cursorAgentEnv, hasCursorApiKey } from "./env.js";
import { ensureCursorAgent } from "./ensure-agent.js";
import { sandboxCommand, sanitizeAgentEnv } from "./sandbox.js";
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
    mcpServers?: AcpMcpServer[];
    onPermission?: (event: SessionEvent, rpcId: number) => void;
  }): Promise<ProviderRun> {
    const env = sanitizeAgentEnv(cursorAgentEnv());
    if (!hasCursorApiKey(env)) throw new Error("CURSOR_API_KEY is not set");
    const command = await ensureCursorAgent({ env });
    const launched = sandboxCommand(command, cursorArgs(input.mode), input.cwd, Boolean(input.sandbox));
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
    acp.start(env, input.cwd);
    await acp.initialize();
    const caps = acp.capabilities?.mcpCapabilities ?? {};
    const servers = (input.mcpServers ?? mcpServersFromWorktree(input.cwd)).filter((server) => {
      if (server.type === "http") return Boolean(caps.http);
      if (server.type === "sse") return Boolean(caps.sse);
      return Boolean(server.command);
    });
    if (input.resumeSessionId) {
      try {
        await acp.loadSession(input.resumeSessionId, input.cwd, servers);
      } catch {
        await acp.newSession(input.cwd, servers);
      }
    } else {
      await acp.newSession(input.cwd, servers);
    }

    return {
      acpSessionId: acp.sessionId ?? undefined,
      prompt: async (blocks) => {
        await acp.prompt(blocks);
      },
      cancel: () => acp.cancel(),
      stop: () => acp.stop(),
      respondPermission: (rpcId, outcome) => {
        acp.respond(rpcId, { outcome: { outcome: "selected", optionId: outcome } });
      },
    };
  }
}
