import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionEvent } from "@atelier/contracts";
import type { AgentProvider, ProviderRun } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

export function loadTranscript(name = "create-inertia-page.ndjson"): SessionEvent[] {
  const candidates = [
    join(process.cwd(), "fixtures/acp", name),
    join(here, "../../../../fixtures/acp", name),
  ];
  const file = candidates.find((p) => existsSync(p));
  if (!file) return defaultEvents();
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionEvent);
}

function defaultEvents(): SessionEvent[] {
  return [
    {
      type: "assistant_message",
      id: "a1",
      at: new Date().toISOString(),
      text: "I will add an Inertia quotes page and a route.",
      streaming: false,
    },
    {
      type: "tool_call",
      id: "t1",
      at: new Date().toISOString(),
      toolCallId: "call_1",
      name: "write",
      status: "completed",
      output: "Wrote resources/js/Pages/Quotes/Index.vue",
    },
    {
      type: "diff",
      id: "d1",
      at: new Date().toISOString(),
      filePath: "resources/js/Pages/Quotes/Index.vue",
      hunks: [
        {
          id: "h1",
          filePath: "resources/js/Pages/Quotes/Index.vue",
          oldStart: 0,
          newStart: 1,
          oldLines: "",
          newLines:
            "<script setup lang=\"ts\">\ndefineProps<{ quotes: Array<{ id: number; customer: string }> }>()\n</script>\n<template>\n  <div class=\"p-6\">\n    <h1>Quotes</h1>\n    <ul><li v-for=\"q in quotes\" :key=\"q.id\">{{ q.customer }}</li></ul>\n  </div>\n</template>\n",
          status: "pending",
        },
      ],
    },
    {
      type: "todos",
      id: "td1",
      at: new Date().toISOString(),
      merge: false,
      todos: [
        { id: "1", content: "Add Quotes page", status: "completed" },
        { id: "2", content: "Register route", status: "in_progress" },
      ],
    },
    {
      type: "checkpoint",
      id: "c1",
      at: new Date().toISOString(),
      gitSha: "fixture",
      label: "After quotes page",
    },
    {
      type: "plan",
      id: "p1",
      at: new Date().toISOString(),
      name: "Quotes page",
      overview: "Add an Inertia quotes list and register the route.",
      plan: "1. Create the page\n2. Register the route",
      todos: [],
      outcome: "pending",
    },
    {
      type: "question",
      id: "q1",
      at: new Date().toISOString(),
      title: "Which quote columns should the table show?",
      questions: [
        {
          id: "cols",
          prompt: "Columns",
          options: [
            { id: "customer", label: "Customer" },
            { id: "total", label: "Total" },
          ],
          allowMultiple: true,
        },
      ],
      outcome: "pending",
    },
    {
      type: "permission",
      id: "perm1",
      at: new Date().toISOString(),
      toolCallId: "call_2",
      title: "Run php artisan route:list --json",
      options: ["allow-once", "allow-always", "reject-once"],
      outcome: "pending",
    },
    {
      type: "runtime_error",
      id: "e1",
      at: new Date().toISOString(),
      source: "preview",
      message: "N+1 on Quote::customer while rendering /quotes",
    },
  ];
}

export class MockProvider implements AgentProvider {
  capability = PROVIDER_CATALOG.find((p) => p.id === "mock")!;

  async start(input: {
    cwd: string;
    onEvent: (event: SessionEvent) => void;
    resumeSessionId?: string;
  }): Promise<ProviderRun> {
    let cancelled = false;
    return {
      prompt: async () => {
        const events = loadTranscript();
        for (const event of events) {
          if (cancelled) break;
          await new Promise((r) => setTimeout(r, 40));
          input.onEvent({ ...event, at: new Date().toISOString() });
        }
      },
      cancel: async () => {
        cancelled = true;
      },
      stop: () => {
        cancelled = true;
      },
    };
  }
}
