import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mcpServersFromWorktree, toAcpMcpServers } from "./cursor.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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
});
