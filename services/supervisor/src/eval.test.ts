import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOLD_TASKS, liveEvalEnabled, runEval, runGoldTask, runLiveAcpEval, runWorktreeGold } from "./eval.js";
import { fakeAcpAgentSource } from "./acp/fake-agent.js";

describe("eval harness", () => {
  it("passes every gold task against MockProvider transcripts", () => {
    const results = runEval();
    expect(results).toHaveLength(GOLD_TASKS.length);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("scores the inertia page task", () => {
    const result = runGoldTask(GOLD_TASKS[0]!);
    expect(result.hunks).toBeGreaterThan(0);
  });

  it("creates a real file, proposal, and checkpoint in a throwaway git worktree", async () => {
    const result = await runWorktreeGold();
    expect(result.ok, result.failures.join("; ")).toBe(true);
    expect(result.hunks).toBeGreaterThan(0);
  });

  it("skips live ACP evals unless ATELIER_LIVE_EVAL=1", async () => {
    expect(liveEvalEnabled({})).toBe(false);
    const skipped = await runLiveAcpEval({ ...process.env, ATELIER_LIVE_EVAL: undefined });
    expect(skipped.skipped).toBe(true);
    expect(skipped.ok).toBe(true);
  });

  it("runs a disposable live ACP eval against a fake agent", async () => {
    const script = join(tmpdir(), `atelier-live-eval-${process.pid}.mjs`);
    writeFileSync(script, fakeAcpAgentSource());
    const result = await runLiveAcpEval({
      ...process.env,
      ATELIER_LIVE_EVAL: "1",
      ATELIER_LIVE_EVAL_COMMAND: process.execPath,
      ATELIER_LIVE_EVAL_ARGS: script,
    });
    expect(result.skipped).toBeFalsy();
    expect(result.ok, result.failures.join("; ")).toBe(true);
  });
});
