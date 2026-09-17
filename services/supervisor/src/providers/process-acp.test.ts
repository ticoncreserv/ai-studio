import { readFileSync, writeFileSync } from "node:fs";
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

  it("skips cursor_login when CURSOR_API_KEY is set", async () => {
    const script = join(tmpdir(), `atelier-process-acp-skip-auth-${process.pid}.mjs`);
    const logFile = join(tmpdir(), `atelier-process-acp-skip-auth-${process.pid}.log`);
    writeFileSync(script, cursorLoginAgentSource());
    writeFileSync(logFile, "");
    const run = await startProcessAcp({
      command: process.execPath,
      args: [script],
      env: { ...process.env, CURSOR_API_KEY: "crsr_test", ACP_METHOD_LOG: logFile },
      cwd: tmpdir(),
      capability: PROVIDER_CATALOG.find((row) => row.id === "cursor")!,
      preferredAuth: ["cursor_login"],
      sandboxProfile: "disabled",
      onEvent: () => undefined,
    });
    expect(run.acpSessionId).toBe("live-1");
    run.stop();
    expect(readFileSync(logFile, "utf8").split("\n")).not.toContain("authenticate");
  });

  it("authenticates with cursor_login only after session/new is unauthenticated without a key", async () => {
    const script = join(tmpdir(), `atelier-process-acp-fallback-auth-${process.pid}.mjs`);
    const logFile = join(tmpdir(), `atelier-process-acp-fallback-auth-${process.pid}.log`);
    writeFileSync(script, cursorLoginAgentSource({ requireAuth: true }));
    writeFileSync(logFile, "");
    const env: NodeJS.ProcessEnv = { ...process.env, ACP_METHOD_LOG: logFile };
    delete env.CURSOR_API_KEY;
    const run = await startProcessAcp({
      command: process.execPath,
      args: [script],
      env,
      cwd: tmpdir(),
      capability: PROVIDER_CATALOG.find((row) => row.id === "cursor")!,
      preferredAuth: ["cursor_login"],
      sandboxProfile: "disabled",
      onEvent: () => undefined,
    });
    expect(run.acpSessionId).toBe("live-1");
    run.stop();
    expect(readFileSync(logFile, "utf8")).toMatch(/session\/new[\s\S]*authenticate[\s\S]*session\/new/);
  });

  it("does not open cursor_login when a key is present even if session/new is unauthenticated", async () => {
    const script = join(tmpdir(), `atelier-process-acp-key-unauth-${process.pid}.mjs`);
    const logFile = join(tmpdir(), `atelier-process-acp-key-unauth-${process.pid}.log`);
    writeFileSync(script, cursorLoginAgentSource({ requireAuth: true }));
    writeFileSync(logFile, "");
    await expect(
      startProcessAcp({
        command: process.execPath,
        args: [script],
        env: { ...process.env, CURSOR_API_KEY: "crsr_test", ACP_METHOD_LOG: logFile },
        cwd: tmpdir(),
        capability: PROVIDER_CATALOG.find((row) => row.id === "cursor")!,
        preferredAuth: ["cursor_login"],
        sandboxProfile: "disabled",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow(/unauthenticated/i);
    expect(readFileSync(logFile, "utf8")).not.toMatch(/authenticate/);
  });
});

function cursorLoginAgentSource(options: { requireAuth?: boolean } = {}): string {
  return `
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
const requireAuth = ${options.requireAuth ? "true" : "false"};
let authenticated = !requireAuth;
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (!msg.id) return;
  if (process.env.ACP_METHOD_LOG) appendFileSync(process.env.ACP_METHOD_LOG, msg.method + "\\n");
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true, mcpCapabilities: { http: false, sse: false } },
        authMethods: [{ id: "cursor_login" }],
      },
    }) + "\\n");
    return;
  }
  if (msg.method === "authenticate") {
    authenticated = true;
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {} }) + "\\n");
    return;
  }
  if (msg.method === "session/new" || msg.method === "session/load") {
    if (!authenticated) {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32000, message: "unauthenticated" },
      }) + "\\n");
      return;
    }
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "live-1" } }) + "\\n");
  }
});
`;
}
