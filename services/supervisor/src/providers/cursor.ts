import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionEvent } from "@atelier/contracts";
import { AcpSession } from "../acp/session.js";
import { eventsFromAcpUpdate, permissionFromAcp } from "../acp/events.js";
import { cursorAgentEnv, hasCursorApiKey } from "./env.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";

function mcpServersFromWorktree(cwd: string): Array<{ name: string; command: string; args?: string[] }> {
  const file = join(cwd, ".cursor", "mcp.json");
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      mcpServers?: Record<string, { command?: string; args?: string[] }>;
    };
    return Object.entries(raw.mcpServers ?? {})
      .filter(([, value]) => value.command)
      .map(([name, value]) => ({ name, command: value.command!, args: value.args ?? [] }));
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
    mcpServers?: Array<{ name: string; command: string; args?: string[] }>;
    onPermission?: (event: SessionEvent, rpcId: number) => void;
  }): Promise<ProviderRun> {
    const env = cursorAgentEnv();
    if (!hasCursorApiKey(env)) throw new Error("CURSOR_API_KEY is not set");
    const acp = new AcpSession(
      this.capability.command,
      cursorArgs(input.mode),
      (msg) => {
        for (const event of eventsFromAcpUpdate(msg)) input.onEvent(event);
      },
      (id, params) => {
        const event = permissionFromAcp(params, id);
        if (input.onPermission) input.onPermission(event, id);
        else acp.respond(id, { outcome: { outcome: "selected", optionId: "allow-once" } });
      },
    );
    acp.start(env, input.cwd);
    await acp.initialize();
    const servers = input.mcpServers ?? mcpServersFromWorktree(input.cwd);
    if (input.resumeSessionId) {
      try {
        await acp.loadSession(input.resumeSessionId, input.cwd);
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
