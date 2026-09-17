export function fakeAcpAgentSource(): string {
  return `
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
        authMethods: [{ id: "api_key" }],
      },
    }) + "\\n");
    return;
  }
  if (msg.method === "authenticate") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {} }) + "\\n");
    return;
  }
  if (msg.method === "session/new" || msg.method === "session/load") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "live-1" } }) + "\\n");
    return;
  }
  if (msg.method === "session/prompt") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "pong" } } },
    }) + "\\n");
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } }) + "\\n");
  }
});
`;
}
