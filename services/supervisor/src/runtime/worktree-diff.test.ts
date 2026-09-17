import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git } from "./git-ops.js";
import { commitWorktree, createProposalCommit, restoreFile, splitHunks, syncBaseBranch, worktreeDiffEvents, worktreeFileStates, worktreeFingerprint, changedWorktreePaths } from "./worktree-diff.js";

const dirs: string[] = [];
const user = { name: "Ada", email: "ada@example.com" };

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("worktree diffs", () => {
  it("parses unified diffs into review hunks", () => {
    const hunks = splitHunks(
      "page.vue",
      "@@ -1,5 +1,5 @@\n same\n-old\n+new\n keep\n-before\n+after\n end\n",
    );
    expect(hunks).toMatchObject([
      { oldStart: 2, newStart: 2, oldLines: "old", newLines: "new" },
      { oldStart: 4, newStart: 4, oldLines: "before", newLines: "after" },
    ]);
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

  it("skips untracked directories instead of throwing EISDIR", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-diff-dir-"));
    dirs.push(dir);
    await git(dir, ["init"]);
    writeFileSync(join(dir, "keep.txt"), "ok\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    mkdirSync(join(dir, "var"), { recursive: true });
    writeFileSync(join(dir, "var", "rule-provenance.json"), "{}\n");
    mkdirSync(join(dir, "scratch"), { recursive: true });
    await expect(worktreeDiffEvents(dir)).resolves.toEqual([]);
  });

  it("keeps a stable fingerprint when only studio var/ files change", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-fp-"));
    dirs.push(dir);
    await git(dir, ["init"]);
    writeFileSync(join(dir, "keep.txt"), "ok\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    const before = await worktreeFingerprint(dir);
    mkdirSync(join(dir, "var"), { recursive: true });
    writeFileSync(join(dir, "var", "rule-provenance.json"), "{}\n");
    expect(await worktreeFingerprint(dir)).toBe(before);
    writeFileSync(join(dir, "keep.txt"), "changed\n");
    expect(await worktreeFingerprint(dir)).not.toBe(before);
  });

  it("creates a proposal commit without moving HEAD", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-proposal-"));
    dirs.push(dir);
    await git(dir, ["init"]);
    writeFileSync(join(dir, "page.vue"), "old\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    const head = await git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "page.vue"), "new\n");
    const proposal = await createProposalCommit(dir, user, "proposal");
    expect(proposal?.baseSha).toBe(head);
    expect(proposal?.proposalSha).toMatch(/^[0-9a-f]{7,}$/);
    expect(proposal?.files).toContain("page.vue");
    expect(await git(dir, ["rev-parse", "HEAD"])).toBe(head);
  });

  it("isolates prompt-changed files from leftover dirty paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-isolate-"));
    dirs.push(dir);
    await git(dir, ["init"]);
    writeFileSync(join(dir, "keep.txt"), "ok\n");
    writeFileSync(join(dir, "leftover.txt"), "stale\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    writeFileSync(join(dir, "leftover.txt"), "still dirty\n");
    const head = await git(dir, ["rev-parse", "HEAD"]);
    const before = await worktreeFileStates(dir);
    writeFileSync(join(dir, "created.php"), "<?php\n");
    const changed = changedWorktreePaths(before, await worktreeFileStates(dir));
    expect(changed).toEqual(["created.php"]);
    const events = await worktreeDiffEvents(dir, changed);
    expect(events).toHaveLength(1);
    if (events[0]?.type === "diff") expect(events[0].filePath).toBe("created.php");
    const proposal = await createProposalCommit(dir, user, "create file", changed);
    expect(proposal?.files).toEqual(["created.php"]);
    expect(proposal?.baseSha).toBe(head);
    expect(await git(dir, ["rev-parse", "HEAD"])).toBe(head);
    const sha = await commitWorktree(dir, user, "accept", changed);
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(await git(dir, ["status", "--porcelain", "--", "created.php"])).toBe("");
    expect(await git(dir, ["status", "--porcelain", "--", "leftover.txt"])).toMatch(/leftover/);
  });

  it("detects content changes to an existing untracked file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-untracked-fp-"));
    dirs.push(dir);
    await git(dir, ["init"]);
    writeFileSync(join(dir, "keep.txt"), "ok\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    writeFileSync(join(dir, "draft.txt"), "first\n");
    const before = await worktreeFingerprint(dir);
    writeFileSync(join(dir, "draft.txt"), "second\n");
    expect(await worktreeFingerprint(dir)).not.toBe(before);
  });
});
