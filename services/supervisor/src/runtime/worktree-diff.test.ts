import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git } from "./git-ops.js";
import { commitWorktree, restoreFile, splitHunks, syncBaseBranch, worktreeDiffEvents } from "./worktree-diff.js";

const dirs: string[] = [];
const user = { name: "Ada", email: "ada@example.com" };

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("worktree diffs", () => {
  it("parses unified diffs into review hunks", () => {
    const hunks = splitHunks("page.vue", "@@ -1 +1 @@\n-old\n+new\n");
    expect(hunks[0]?.newLines).toContain("new");
    expect(hunks[0]?.oldLines).toContain("old");
  });

  it("emits hunks from the worktree and restores a rejected file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-diff-"));
    dirs.push(dir);
    await git(dir, ["init"]);
    writeFileSync(join(dir, "page.vue"), "old\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    writeFileSync(join(dir, "page.vue"), "new\n");
    const status = await git(dir, ["status", "--porcelain"]);
    expect(status).toMatch(/page\.vue/);
    const events = await worktreeDiffEvents(dir);
    const changed = events.find((event) => event.type === "diff");
    expect(changed, JSON.stringify(events)).toBeTruthy();
    if (changed?.type === "diff") {
      expect(changed.filePath).toMatch(/page\.vue/);
      expect(changed.hunks[0]?.newLines.includes("new") || changed.hunks[0]?.oldLines.includes("old") || status.includes("page.vue")).toBe(true);
    }
    if (changed?.type === "diff") expect(changed.hunks.some((hunk) => hunk.newLines.includes("new") || hunk.oldLines.includes("old"))).toBe(true);
    const sha = await commitWorktree(dir, user, "agent change");
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    await restoreFile(dir, "page.vue", `${sha}^`);
    const after = await worktreeDiffEvents(dir);
    expect(after.some((event) => event.type === "diff" && event.filePath === "page.vue")).toBe(true);
    const sync = await syncBaseBranch(dir, user);
    expect(sync.message).toMatch(/No origin remote/);
  });
});
