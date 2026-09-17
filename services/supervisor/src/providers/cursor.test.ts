import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cursorAcpArgs, mcpServersFromWorktree, toAcpMcpServers } from "./cursor.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("cursor ACP args", () => {
  it("passes --api-key before acp so the CLI is pre-authenticated", () => {
    expect(cursorAcpArgs("agent", undefined, "crsr_test")).toEqual(["--api-key", "crsr_test", "--trust", "acp"]);
    expect(cursorAcpArgs("plan", "gpt-5", "crsr_test")).toEqual([
      "--api-key",
      "crsr_test",
      "--trust",
      "--mode",
      "plan",
      "--model",
      "gpt-5",
      "acp",
    ]);
  });

  it("omits --api-key when the slot has no value", () => {
    expect(cursorAcpArgs()).toEqual(["--trust", "acp"]);
    expect(cursorAcpArgs("agent", undefined, "  ")).toEqual(["--trust", "acp"]);
  });
});

describe("ACP MCP servers", () => {
  it("emits the stdio env array Cursor session/new requires", () => {
    const servers = toAcpMcpServers({
      mcpServers: {
        "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] },
      },
    });
    expect(servers).toEqual([
      { name: "laravel-boost", command: "php", args: ["artisan", "boost:mcp"], env: [] },
    ]);
    expect(JSON.stringify(servers)).toContain('"env":[]');
  });

  it("converts Cursor record env into ACP {name,value} entries", () => {
    expect(
      toAcpMcpServers({
        mcpServers: {
          boost: { command: "php", args: ["artisan", "boost:mcp"], env: { APP_ENV: "testing" } },
        },
      })[0]?.env,
    ).toEqual([{ name: "APP_ENV", value: "testing" }]);
  });

  it("reads worktree .cursor/mcp.json into ACP shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-mcp-"));
    dirs.push(dir);
    mkdirSync(join(dir, ".cursor"), { recursive: true });
    writeFileSync(
      join(dir, ".cursor/mcp.json"),
      JSON.stringify({ mcpServers: { "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] } } }),
    );
    expect(mcpServersFromWorktree(dir)[0]).toMatchObject({ name: "laravel-boost", env: [] });
  });

  it("maps http servers only when the agent advertises the capability", () => {
    const servers = toAcpMcpServers(
      { mcpServers: { linear: { url: "https://mcp.linear.app/mcp" }, boost: { command: "php" } } },
      { http: true },
    );
    expect(servers.some((row) => row.type === "http" && row.name === "linear")).toBe(true);
    expect(toAcpMcpServers({ mcpServers: { linear: { url: "https://mcp.linear.app/mcp" } } }, {}).length).toBe(0);
  });
});
