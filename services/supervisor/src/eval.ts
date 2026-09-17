import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderId, SessionEvent } from "@atelier/contracts";
import { defaultFlags, foldEvents } from "@atelier/domain";
import { git } from "./runtime/git-ops.js";
import { resolveWorktreePath } from "./runtime/process.js";
import { commitWorktree, createProposalCommit, worktreeDiffEvents, worktreeFingerprint } from "./runtime/worktree-diff.js";
import { loadTranscript } from "./transcripts.js";
import { startProcessAcp } from "./providers/process-acp.js";
import { PROVIDER_CATALOG } from "./providers/types.js";
import { createProvider } from "./providers/index.js";
import { inspectProviderHealth } from "./providers/health.js";

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

export interface LiveEvalResult {
  id: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  failures: string[];
  hunks: number;
  tools: number;
}

export function liveEvalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ATELIER_LIVE_EVAL === "1";
}

export { fakeAcpAgentSource } from "./acp/fake-agent.js";

export async function runLiveAcpEval(env: NodeJS.ProcessEnv = process.env): Promise<LiveEvalResult> {
  if (!liveEvalEnabled(env)) {
    return { id: "live-acp", ok: true, skipped: true, reason: "ATELIER_LIVE_EVAL is not set", failures: [], hunks: 0, tools: 0 };
  }
  const dir = mkdtempSync(join(tmpdir(), "atelier-live-eval-"));
  const user = { name: "Eval", email: "eval@example.com" };
  try {
    await git(dir, ["init"]);
    writeFileSync(join(dir, "README.md"), "# live eval\n");
    await git(dir, ["add", "-A"], user);
    await git(dir, ["commit", "-m", "base"], user);
    const command = env.ATELIER_LIVE_EVAL_COMMAND?.trim();
    const args = env.ATELIER_LIVE_EVAL_ARGS?.trim() ? env.ATELIER_LIVE_EVAL_ARGS.trim().split(/\s+/) : [];
    const events: SessionEvent[] = [];
    if (command) {
      const run = await startProcessAcp({
        command,
        args,
        env,
        cwd: dir,
        capability: PROVIDER_CATALOG.find((row) => row.id === "mock")!,
        sandboxProfile: "disabled",
        onEvent: (event) => events.push(event),
      });
      await run.prompt([{ type: "text", text: "ping" }]);
      await run.cancel();
      run.stop();
    } else {
      const providerId = (env.ATELIER_LIVE_EVAL_PROVIDER ?? "cursor") as ProviderId;
      const health = inspectProviderHealth(providerId, { ...defaultFlags, multiProvider: true, claudeProvider: true, geminiProvider: true, grokProvider: true, codexProvider: true }, env);
      if (health.status !== "available" && health.status !== "degraded") {
        return {
          id: "live-acp",
          ok: true,
          skipped: true,
          reason: health.message ?? `${providerId} is not ready`,
          failures: [],
          hunks: 0,
          tools: 0,
        };
      }
      const run = await createProvider(providerId).start({
        cwd: dir,
        sandboxProfile: "disabled",
        onEvent: (event) => events.push(event),
      });
      await run.prompt([{ type: "text", text: "ping" }]);
      await run.cancel();
      run.stop();
    }
    const failures: string[] = [];
    if (!events.some((event) => event.type === "assistant_delta" || event.type === "assistant_message")) {
      failures.push("expected an assistant update from the live ACP session");
    }
    return { id: "live-acp", ok: failures.length === 0, failures, hunks: 0, tools: events.filter((event) => event.type === "tool_call").length };
  } catch (error) {
    return {
      id: "live-acp",
      ok: false,
      failures: [error instanceof Error ? error.message : String(error)],
      hunks: 0,
      tools: 0,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("eval.ts")) {
  const results = runEval();
  const worktree = await runWorktreeGold();
  const live = await runLiveAcpEval();
  const all = [...results, worktree, live];
  const failed = all.filter((r) => !r.ok);
  console.info(JSON.stringify({ passed: all.length - failed.length, failed: failed.length, results: all }, null, 2));
  if (failed.length) process.exit(1);
}
