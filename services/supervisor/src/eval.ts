import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { foldEvents } from "@atelier/domain";
import { git } from "./runtime/git-ops.js";
import { resolveWorktreePath } from "./runtime/process.js";
import { commitWorktree, createProposalCommit, worktreeDiffEvents, worktreeFingerprint } from "./runtime/worktree-diff.js";
import { loadTranscript } from "./transcripts.js";

export interface GoldTask {
  id: string;
  transcript: string;
  expect: {
    minHunks?: number;
    hasTool?: boolean;
    hasCheckpoint?: boolean;
    titleContains?: string;
    skill?: string;
  };
}

export const GOLD_TASKS: GoldTask[] = [
  { id: "create-inertia-page", transcript: "create-inertia-page.ndjson", expect: { minHunks: 1, hasTool: true, hasCheckpoint: true } },
  { id: "add-model-field", transcript: "add-model-field.ndjson", expect: { minHunks: 1 } },
  { id: "fix-preview-error", transcript: "fix-preview-error.ndjson", expect: { hasTool: true } },
  { id: "inertia-crud", transcript: "inertia-crud.ndjson", expect: { minHunks: 1, hasCheckpoint: true } },
  { id: "deny-env-read", transcript: "deny-env-read.ndjson", expect: { hasTool: true } },
  { id: "mention-route", transcript: "mention-route.ndjson", expect: { minHunks: 1 } },
  { id: "schema-guard", transcript: "schema-guard.ndjson", expect: { hasTool: true } },
  { id: "skill-invocation", transcript: "skill-invocation.ndjson", expect: { minHunks: 1, hasTool: true, skill: "create-inertia-page" } },
];

export function runGoldTask(task: GoldTask) {
  const events = loadTranscript(task.transcript);
  const state = foldEvents(events);
  const failures: string[] = [];
  if (task.expect.minHunks && state.hunks.length < task.expect.minHunks) {
    failures.push(`expected >= ${task.expect.minHunks} hunks, got ${state.hunks.length}`);
  }
  if (task.expect.hasTool && state.toolCalls.length === 0) failures.push("expected a tool call");
  if (task.expect.hasCheckpoint && state.checkpoints.length === 0) failures.push("expected a checkpoint");
  if (task.expect.titleContains) {
    const user = events.find((event) => event.type === "user_message");
    if (!user || user.type !== "user_message" || !user.text.includes(task.expect.titleContains)) {
      failures.push(`expected title to contain ${task.expect.titleContains}`);
    }
  }
  if (task.expect.skill) {
    const user = events.find((event) => event.type === "user_message");
    if (!user || user.type !== "user_message" || user.skill !== task.expect.skill) {
      failures.push(`expected skill ${task.expect.skill}`);
    }
  }
  return { id: task.id, ok: failures.length === 0, failures, hunks: state.hunks.length, tools: state.toolCalls.length };
}

export function runEval() {
  return GOLD_TASKS.map(runGoldTask);
}

export async function runWorktreeGold() {
  const dir = mkdtempSync(join(tmpdir(), "atelier-eval-"));
  const user = { name: "Eval", email: "eval@example.com" };
  try {
    await git(dir, ["init"]);
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(join(dir, "app", "Keep.php"), "<?php\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    const before = await worktreeFingerprint(dir);
    writeFileSync(join(dir, "app", "Created.php"), "<?php echo 'ok';\n");
    if ((await worktreeFingerprint(dir)) === before) {
      return { id: "worktree-create-file", ok: false, failures: ["fingerprint ignored the new file"], hunks: 0, tools: 0 };
    }
    const diffs = await worktreeDiffEvents(dir);
    const proposal = await createProposalCommit(dir, user, "create file");
    const head = await git(dir, ["rev-parse", "HEAD"]);
    const failures: string[] = [];
    if (!diffs.some((event) => event.type === "diff" && event.filePath === "app/Created.php")) {
      failures.push("expected a diff for app/Created.php");
    }
    if (!proposal) failures.push("expected a proposal commit");
    if (proposal && proposal.baseSha !== head) failures.push("proposal moved HEAD");
    if (readFileSync(join(dir, "app", "Created.php"), "utf8").includes("ok") === false) {
      failures.push("created file missing contents");
    }
    try {
      resolveWorktreePath(dir, "../outside.php");
      failures.push("path escape was allowed");
    } catch {
      /* expected */
    }
    const sha = await commitWorktree(dir, user, "accept created file");
    if (!sha) failures.push("expected a checkpoint commit");
    return { id: "worktree-create-file", ok: failures.length === 0, failures, hunks: diffs.length, tools: 0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("eval.ts")) {
  const results = runEval();
  const worktree = await runWorktreeGold();
  const all = [...results, worktree];
  const failed = all.filter((r) => !r.ok);
  console.info(JSON.stringify({ passed: all.length - failed.length, failed: failed.length, results: all }, null, 2));
  if (failed.length) process.exit(1);
}
