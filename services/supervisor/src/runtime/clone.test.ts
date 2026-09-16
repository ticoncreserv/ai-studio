import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isForeignWorktree, provisionWorktree } from "./clone.js";
import { git } from "./git-ops.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "atelier-clone-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("provisionWorktree", () => {
  it("clones a temporary git repo instead of a production fixture", async () => {
    const source = tempDir();
    await git(source, ["init", "-b", "main"]);
    writeFileSync(join(source, "README.md"), "real source");
    mkdirSync(join(source, "app", "Models"), { recursive: true });
    writeFileSync(join(source, "app", "Models", "Widget.php"), "<?php class Widget {}");
    await git(source, ["add", "-A"], { name: "Ada", email: "ada@example.com" });
    await git(source, ["commit", "-m", "init"], { name: "Ada", email: "ada@example.com" });

    const worktree = join(tempDir(), "ws");
    await provisionWorktree({
      worktree,
      branch: "user/ada/studio",
      user: { name: "Ada", email: "ada@example.com" },
      sourceDir: source,
    });
    const branch = await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(branch).toBe("user/ada/studio");
    expect(await isForeignWorktree(worktree, "ticoncreserv/app")).toBe(true);
  });

  it("refuses to provision without GitHub credentials or a test source", async () => {
    await expect(
      provisionWorktree({
        worktree: join(tempDir(), "missing"),
        branch: "user/ada/studio",
        user: { name: "Ada", email: "ada@example.com" },
      }),
    ).rejects.toThrow(/GitHub App credentials/);
  });
});
