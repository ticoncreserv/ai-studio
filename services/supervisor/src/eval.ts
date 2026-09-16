import { foldEvents } from "@atelier/domain";
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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("eval.ts")) {
  const results = runEval();
  const failed = results.filter((r) => !r.ok);
  console.info(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length) process.exit(1);
}
