import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@atelier/contracts";
import { collectAssistantReplies, PromptTextBuffer, shouldFlushAssistantText } from "./prompt-text.js";

function delta(text: string): SessionEvent {
  return { type: "assistant_delta", id: "d", at: "t", text };
}

function tool(status: "running" | "completed" | "failed"): SessionEvent {
  return { type: "tool_call", id: "t1", at: "t", toolCallId: "c1", name: "Read", status };
}

describe("PromptTextBuffer", () => {
  it("resets so a reused ACP run cannot leak the previous reply", () => {
    const buffer = new PromptTextBuffer();
    buffer.append("s", "Reading caveman skill, then reply. pong. Ready.");
    buffer.reset("s");
    buffer.append("s", "Sim. Tudo ok.");
    expect(buffer.take("s")).toBe("Sim. Tudo ok.");
  });
});

describe("shouldFlushAssistantText", () => {
  it("flushes when a tool starts, not when it finishes", () => {
    expect(shouldFlushAssistantText(tool("running"))).toBe(true);
    expect(shouldFlushAssistantText(tool("completed"))).toBe(false);
    expect(shouldFlushAssistantText(delta("hi"))).toBe(false);
    expect(
      shouldFlushAssistantText({
        type: "plan",
        id: "p",
        at: "t",
        plan: "do it",
        todos: [],
        outcome: "pending",
      }),
    ).toBe(true);
  });
});

describe("collectAssistantReplies", () => {
  it("keeps the last bubble as the post-tool answer only", () => {
    expect(
      collectAssistantReplies([
        delta("Readingcavemanskill,thenreply."),
        tool("running"),
        tool("completed"),
        delta("pong. Ready."),
      ]),
    ).toEqual(["Readingcavemanskill,thenreply.", "pong. Ready."]);
  });

  it("starts a new answer after the next prompt", () => {
    const first = collectAssistantReplies([
      delta("Readingcavemanskill,thenreply."),
      tool("running"),
      delta("pong. Ready."),
    ]);
    const second = collectAssistantReplies([
      delta("Readingcavemanskill,thenreply."),
      tool("running"),
      delta("Sim. Tudo ok."),
    ]);
    expect(first.at(-1)).toBe("pong. Ready.");
    expect(second.at(-1)).toBe("Sim. Tudo ok.");
  });
});
