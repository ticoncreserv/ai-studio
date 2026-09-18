import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@atelier/contracts";
import { collapseSessionEvents, sessionEventKey, upsertSessionEvent } from "./session-events.js";

function tool(
  id: string,
  status: "running" | "completed" | "failed",
  extra: Partial<Extract<SessionEvent, { type: "tool_call" }>> = {},
): SessionEvent {
  return {
    type: "tool_call",
    id,
    at: "t",
    toolCallId: "c1",
    name: "Read",
    status,
    ...extra,
  };
}

describe("session events", () => {
  it("keys tool calls by toolCallId", () => {
    expect(sessionEventKey(tool("t1", "running"))).toBe("tool_call:c1");
    expect(sessionEventKey({ type: "user_message", id: "u1", at: "t", text: "hi", attachments: [], mentions: [] })).toBe(
      "user_message:u1",
    );
  });

  it("collapses lifecycle updates into one event and keeps the first id", () => {
    const running = tool("t1", "running", { kind: "read", target: "Form.php" });
    const update = tool("t2", "running", { name: "tool" });
    const done = tool("t3", "completed", { name: "tool", output: "ok" });
    expect(collapseSessionEvents([running, update, done])).toEqual([
      {
        type: "tool_call",
        id: "t1",
        at: "t",
        toolCallId: "c1",
        name: "Read",
        kind: "read",
        target: "Form.php",
        status: "completed",
        output: "ok",
      },
    ]);
  });

  it("does not regress a completed tool back to running", () => {
    const done = tool("t1", "completed", { output: "ok" });
    expect(upsertSessionEvent([done], tool("t2", "running"))).toEqual([done]);
  });

  it("ignores assistant deltas and skill catalogs", () => {
    expect(
      upsertSessionEvent([], { type: "assistant_delta", id: "a1", at: "t", text: "Hi" }),
    ).toEqual([]);
  });
});
