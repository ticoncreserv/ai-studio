import type { SessionEvent } from "@atelier/contracts";
import { AcpSession } from "../acp/session.js";
import { cursorAgentEnv, hasCursorApiKey } from "./env.js";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";

export class CursorProvider implements AgentProvider {
  capability = PROVIDER_CATALOG.find((p) => p.id === "cursor")!;

  async start(input: {
    cwd: string;
    onEvent: (event: SessionEvent) => void;
    resumeSessionId?: string;
  }): Promise<ProviderRun> {
    const env = cursorAgentEnv();
    if (!hasCursorApiKey(env)) throw new Error("CURSOR_API_KEY is not set");
    const acp = new AcpSession(
      this.capability.command,
      this.capability.args,
      (msg) => {
        const update = (msg.params as { update?: { sessionUpdate?: string; content?: { text?: string } } })?.update;
        if (update?.sessionUpdate === "agent_message_chunk" && update.content?.text) {
          input.onEvent({
            type: "assistant_delta",
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            text: update.content.text,
          });
        }
      },
      (id) => {
        acp.respond(id, { outcome: { outcome: "selected", optionId: "allow-once" } });
      },
    );
    acp.start(env, input.cwd);
    await acp.initialize();
    if (input.resumeSessionId) {
      try {
        await acp.loadSession(input.resumeSessionId, input.cwd);
      } catch {
        await acp.newSession(input.cwd);
      }
    } else {
      await acp.newSession(input.cwd);
    }

    return {
      prompt: async (blocks) => {
        await acp.prompt(blocks);
      },
      cancel: () => acp.cancel(),
      stop: () => acp.stop(),
    };
  }
}
