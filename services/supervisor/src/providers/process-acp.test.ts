import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fakeAcpAgentSource } from "../acp/fake-agent.js";
import { PROVIDER_CATALOG } from "./types.js";
import { startProcessAcp } from "./process-acp.js";

describe("process ACP provider", () => {
  it("initializes, authenticates, prompts, and cancels a fake agent", async () => {
    const script = join(tmpdir(), `atelier-process-acp-${process.pid}.mjs`);
    writeFileSync(script, fakeAcpAgentSource());
    const events: string[] = [];
    const run = await startProcessAcp({
      command: process.execPath,
      args: [script],
      env: { ...process.env, ANTHROPIC_API_KEY: "sk" },
      cwd: tmpdir(),
      capability: PROVIDER_CATALOG.find((row) => row.id === "claude")!,
      preferredAuth: ["api_key"],
      sandboxProfile: "disabled",
      onEvent: (event) => events.push(event.type),
    });
    expect(run.acpSessionId).toBe("live-1");
    await run.prompt([{ type: "text", text: "ping" }]);
    await run.cancel();
    run.stop();
    expect(events).toContain("assistant_delta");
  });

  it("sets the advertised model over session/set_config_option", async () => {
    const script = join(tmpdir(), `atelier-process-acp-model-${process.pid}.mjs`);
    writeFileSync(script, fakeAcpAgentSource());
    const run = await startProcessAcp({
      command: process.execPath,
      args: [script],
      env: { ...process.env, ANTHROPIC_API_KEY: "sk" },
      cwd: tmpdir(),
      capability: PROVIDER_CATALOG.find((row) => row.id === "claude")!,
      preferredAuth: ["api_key"],
      sandboxProfile: "disabled",
      model: "model-2",
      onEvent: () => undefined,
    });
    expect(run.modelId).toBe("model-2");
    expect(run.models?.map((row) => row.id)).toEqual(["model-1", "model-2"]);
    run.stop();
  });
});
