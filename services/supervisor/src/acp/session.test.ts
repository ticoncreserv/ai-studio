import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AcpSession, selectAuthMethod } from "./session.js";

describe("ACP client", () => {
  it("picks a preferred auth method without assuming Cursor", () => {
    expect(selectAuthMethod([{ id: "cursor_login" }, { id: "anthropic_api_key" }], ["anthropic_api_key"])).toBe(
      "anthropic_api_key",
    );
    expect(selectAuthMethod([{ id: "gemini_api_key" }], undefined, { GEMINI_API_KEY: "g" })).toBe("gemini_api_key");
    expect(selectAuthMethod([{ id: "xai.api_key" }], undefined, { XAI_API_KEY: "x" })).toBe("xai.api_key");
  });

  it("serializes initialize and authenticate envelopes", () => {
    const sent: string[] = [];
    const acp = new AcpSession("echo", [], () => undefined, () => undefined);
    (acp as unknown as { proc: { stdin: { write: (s: string) => void } } }).proc = {
      stdin: { write: (s: string) => sent.push(s) },
    };
    void acp.initialize();
    void acp.authenticate("cursor_login");
    acp.sessionId = "s1";
    void acp.setConfigOption("model", "gpt-5");
    void acp.cancel();
    expect(sent[0]).toContain('"method":"initialize"');
    expect(sent[1]).toContain("cursor_login");
    expect(sent[2]).toContain('"method":"session/set_config_option"');
    expect(sent[2]).toContain('"configId":"model"');
    expect(sent[2]).toContain("gpt-5");
    expect(sent[3]).toContain('"method":"session/cancel"');
    expect(sent[3]).not.toMatch(/"id":\s*\d+/);
  });

  it("rejects JSON-RPC errors as Error so the studio can surface the payload", async () => {
    const script = join(tmpdir(), `atelier-acp-fake-${process.pid}.mjs`);
    writeFileSync(
      script,
      `
      import { createInterface } from "node:readline";
      const rl = createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        const error = {
          code: -32603,
          message: "Internal error",
          data: [{ path: ["mcpServers", 0], message: "Invalid input" }],
        };
        const result = msg.method === "session/new" ? undefined : { protocolVersion: 1, sessionId: "s1" };
        process.stdout.write(JSON.stringify(result ? { jsonrpc: "2.0", id: msg.id, result } : { jsonrpc: "2.0", id: msg.id, error }) + "\\n");
      });
      `,
    );
    const acp = new AcpSession(process.execPath, [script], () => undefined, () => undefined);
    acp.start();
    await acp.initialize();
    await expect(acp.newSession("/tmp", [{ name: "laravel-boost", command: "php", args: ["artisan", "boost:mcp"] }])).rejects.toThrow(
      /mcpServers/,
    );
    acp.stop();
  });

  it("runs initialize, session/new, prompt, and cancel against a fake ACP agent", async () => {
    const script = join(tmpdir(), `atelier-acp-lifecycle-${process.pid}.mjs`);
    writeFileSync(
      script,
      `
      import { createInterface } from "node:readline";
      const rl = createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (!msg.id) return;
        if (msg.method === "initialize") {
          process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: 1,
              agentCapabilities: { loadSession: true, mcpCapabilities: { http: false, sse: false } },
              authMethods: [],
            },
          }) + "\\n");
          return;
        }
        if (msg.method === "session/new") {
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "sess-1" } }) + "\\n");
          return;
        }
        if (msg.method === "session/prompt") {
          process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "ok" } } },
          }) + "\\n");
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } }) + "\\n");
        }
      });
      `,
    );
    const updates: string[] = [];
    const acp = new AcpSession(process.execPath, [script], (msg) => updates.push(JSON.stringify(msg)), () => undefined);
    acp.start();
    await acp.initialize();
    expect(acp.capabilities?.loadSession).toBe(true);
    expect(await acp.newSession("/tmp")).toBe("sess-1");
    await acp.prompt([{ type: "text", text: "hello" }]);
    expect(updates.some((row) => row.includes("ok"))).toBe(true);
    await acp.cancel();
    acp.stop();
  });
});
