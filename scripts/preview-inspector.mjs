#!/usr/bin/env node
// MCP-shaped stub the workspace .cursor/mcp.json points at.
process.stdin.on("data", () => {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      result: { errors: [], debug: { timeMs: 42, queries: 3 } },
    }) + "\n",
  );
});
