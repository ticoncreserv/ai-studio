import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectMcp, mergeWorktreeMcp, snapshotRepoMcp, worktreeMcpPath, writePlatformMcp, writeUserMcp } from "./layers.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "atelier-mcp-"));
  dirs.push(dir);
  return dir;
}

describe("mcp layers", () => {
  it("keeps repository servers when merging laravel-boost", () => {
    const worktree = temp();
    const storeDir = temp();
    mkdirSync(join(worktree, ".cursor"), { recursive: true });
    writeFileSync(
      join(worktree, ".cursor/mcp.json"),
      JSON.stringify({
        mcpServers: {
          linear: { url: "https://mcp.linear.app/mcp", extra: true },
        },
      }),
    );
    const { written } = mergeWorktreeMcp({ worktree, storeDir });
    expect(written.map((row) => row.name).sort()).toEqual(["laravel-boost", "linear"]);
    const disk = JSON.parse(readFileSync(worktreeMcpPath(worktree), "utf8")) as {
      mcpServers: Record<string, { extra?: boolean; command?: string }>;
    };
    expect(disk.mcpServers.linear?.extra).toBe(true);
    expect(disk.mcpServers["laravel-boost"]?.command).toBe("php");
  });

  it("does not treat a hardcoded boost-only file as a repository config", () => {
    const worktree = temp();
    mkdirSync(join(worktree, ".cursor"), { recursive: true });
    writeFileSync(
      join(worktree, ".cursor/mcp.json"),
      JSON.stringify({ mcpServers: { "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] } } }),
    );
    const snapshot = snapshotRepoMcp(worktree) as { mcpServers?: Record<string, unknown> };
    expect(snapshot.mcpServers).toEqual({});
  });

  it("drops disabled servers from the worktree file", () => {
    const worktree = temp();
    const storeDir = temp();
    writePlatformMcp(storeDir, {
      mcpServers: { "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] } },
    });
    writeUserMcp(storeDir, "u1", { mcpServers: { notes: { url: "https://notes.example/mcp" } } });
    mergeWorktreeMcp({
      worktree,
      storeDir,
      userId: "u1",
      prefs: [{ userId: "u1", name: "notes", enabled: false }],
    });
    const { entries } = collectMcp({
      worktree,
      storeDir,
      userId: "u1",
      prefs: [{ userId: "u1", name: "notes", enabled: false }],
    });
    expect(entries.find((row) => row.name === "notes")?.enabled).toBe(false);
    const disk = JSON.parse(readFileSync(worktreeMcpPath(worktree), "utf8")) as { mcpServers: Record<string, unknown> };
    expect(disk.mcpServers.notes).toBeUndefined();
    expect(disk.mcpServers["laravel-boost"]).toBeTruthy();
  });
});
