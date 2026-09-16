import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AcpSession } from "./session.js";

describe("ACP client", () => {
  it("serializes initialize and authenticate envelopes", () => {
    const sent: string[] = [];
    const acp = new AcpSession("echo", [], () => undefined, () => undefined);
    (acp as unknown as { proc: { stdin: { write: (s: string) => void } } }).proc = {
      stdin: { write: (s: string) => sent.push(s) },
    };
    void acp.initialize();
    void acp.authenticate();
    expect(sent[0]).toContain('"method":"initialize"');
    expect(sent[1]).toContain("cursor_login");
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
});
