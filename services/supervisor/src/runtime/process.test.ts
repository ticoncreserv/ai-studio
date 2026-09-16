import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyHunkToWorktree,
  applyPatchHunkToWorktree,
  ProcessRuntime,
  readWorktreeFile,
} from "./process.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function listenInChild(): Promise<{ port: number; child: ReturnType<typeof spawn> }> {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `const { createServer } = require("node:net");
       const server = createServer();
       server.listen(0, "127.0.0.1", () => {
         process.stdout.write(String(server.address().port));
       });`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout?.once("data", (chunk) => {
      resolve({ port: Number(String(chunk)), child });
    });
  });
}

describe("ProcessRuntime.hibernate", () => {
  it("stops a leftover listener when the handle is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-runtime-"));
    dirs.push(dir);
    process.env.ATELIER_WORKTREE_ROOT = dir;
    const { port, child } = await listenInChild();
    const runtime = new ProcessRuntime(dir);
    await runtime.hibernate("stale-workspace", { port });
    await new Promise<void>((resolve) => {
      if (child.exitCode != null) {
        resolve();
        return;
      }
      child.once("exit", () => resolve());
      setTimeout(resolve, 1000);
    });
    expect(child.exitCode ?? child.signalCode).toBeTruthy();
    expect(runtime.isRunning("stale-workspace")).toBe(false);
    const reused = createServer();
    await new Promise<void>((resolve, reject) => {
      reused.once("error", reject);
      reused.listen(port, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((resolve) => reused.close(() => resolve()));
  });
});

describe("worktree file actions", () => {
  it("applies one review hunk without replacing the rest of the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-hunk-"));
    dirs.push(dir);
    writeFileSync(join(dir, "page.vue"), "first\nold\nlast\n");
    const hunk = {
      id: "h1",
      filePath: "page.vue",
      oldStart: 2,
      newStart: 2,
      oldLines: "old",
      newLines: "new",
      status: "pending" as const,
    };

    applyPatchHunkToWorktree(dir, hunk, "forward");
    applyPatchHunkToWorktree(dir, hunk, "forward");
    expect(readWorktreeFile(dir, "page.vue")).toBe("first\nnew\nlast\n");

    applyPatchHunkToWorktree(dir, hunk, "reverse");
    expect(readWorktreeFile(dir, "page.vue")).toBe("first\nold\nlast\n");
  });

  it("rejects traversal and symbolic-link escapes", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-path-"));
    const outside = mkdtempSync(join(tmpdir(), "atelier-outside-"));
    dirs.push(dir, outside);
    symlinkSync(outside, join(dir, "linked"), "dir");

    expect(() => applyHunkToWorktree(dir, "../outside.php", "bad")).toThrow(/escapes the worktree/);
    expect(() => applyHunkToWorktree(dir, "linked/outside.php", "bad")).toThrow(/symbolic link/);
    expect(existsSync(join(outside, "outside.php"))).toBe(false);
  });
});
