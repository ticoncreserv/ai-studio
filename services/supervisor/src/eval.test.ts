import { describe, expect, it } from "vitest";
import { GOLD_TASKS, runEval, runGoldTask, runWorktreeGold } from "./eval.js";

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
});
