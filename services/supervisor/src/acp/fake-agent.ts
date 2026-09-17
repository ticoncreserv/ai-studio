export function fakeAcpAgentSource(): string {
  return `
import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin });
const models = [
  { value: "model-1", name: "Model 1" },
  { value: "model-2", name: "Model 2" },
];
let current = "model-1";
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
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        sessionId: "live-1",
        configOptions: [{ id: "model", category: "model", type: "select", currentValue: current, options: models }],
      },
    }) + "\\n");
    return;
  }
  if (msg.method === "session/set_config_option") {
    current = String(msg.params?.value ?? current);
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: { configOptions: [{ id: "model", category: "model", type: "select", currentValue: current, options: models }] },
    }) + "\\n");
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
