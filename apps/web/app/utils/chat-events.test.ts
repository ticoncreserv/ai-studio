import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@atelier/contracts";
import {
  hasProgressAfterLastUser,
  mergePendingTurn,
  upsertSessionEvent,
  userMessageCount,
  type PendingUserTurn,
} from "./chat-events";

function user(id: string, text: string): SessionEvent {
  return { type: "user_message", id, at: "t", text, attachments: [], mentions: [] };
}

const pending: PendingUserTurn = {
  id: "pending-1",
  text: "Add a quotes page",
  at: "t",
  attachments: [],
  mentions: [],
  waitUntilCount: 1,
  status: "sending",
};

describe("chat events", () => {
  it("shows the optimistic user turn until the server event lands", () => {
    expect(mergePendingTurn([], pending)).toEqual([user("pending-1", "Add a quotes page")]);
    expect(mergePendingTurn([user("srv", "Create a plan only. Do not edit files.\n\nAdd a quotes page")], pending)).toEqual([
      user("srv", "Create a plan only. Do not edit files.\n\nAdd a quotes page"),
    ]);
  });

  it("keeps a failed turn visible even after later user messages", () => {
    const failed = { ...pending, status: "failed" as const, waitUntilCount: 1 };
    expect(mergePendingTurn([user("srv", "other")], failed).map((event) => event.id)).toEqual(["srv", "pending-1"]);
  });

  it("treats tools and tokens as live progress after the last prompt", () => {
    expect(hasProgressAfterLastUser([user("u", "hi")])).toBe(false);
    expect(
      hasProgressAfterLastUser([
        user("u", "hi"),
        { type: "assistant_delta", id: "live", at: "t", text: "Sure" },
      ]),
    ).toBe(true);
    expect(
      hasProgressAfterLastUser([
        user("u", "hi"),
        {
          type: "tool_call",
          id: "t1",
          at: "t",
          toolCallId: "c1",
          name: "Read",
          status: "running",
        },
      ]),
    ).toBe(true);
  });

  it("upserts tool calls by id and ignores duplicate events", () => {
    const running: SessionEvent = {
      type: "tool_call",
      id: "t1",
      at: "t",
      toolCallId: "c1",
      name: "Read",
      status: "running",
    };
    const done: SessionEvent = { ...running, status: "completed", output: "ok" };
    const once = upsertSessionEvent([], running);
    expect(userMessageCount([user("a", "x"), user("b", "y")])).toBe(2);
    expect(upsertSessionEvent(once, done)).toEqual([done]);
    expect(upsertSessionEvent(once, running)).toEqual(once);
  });
});
