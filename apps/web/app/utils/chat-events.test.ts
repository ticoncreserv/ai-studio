import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@atelier/contracts";
import {
  hasProgressAfterLastUser,
  isComposerBusy,
  isLiveSessionEvent,
  isSessionRunActive,
  mergePendingTurn,
  mergeSessionEvents,
  nextReconnectDelay,
  shouldShowWorking,
  upsertSessionEvent,
  userMessageCount,
  CHAT_RECONNECT_MAX_MS,
  type PendingUserTurn,
} from "./chat-events";

function user(id: string, text: string): SessionEvent {
  return { type: "user_message", id, at: "t", text, attachments: [], mentions: [] };
}

function permission(id: string, outcome: "pending" | "allow-once" | "reject-once" = "pending"): SessionEvent {
  return {
    type: "permission",
    id,
    at: "t",
    toolCallId: "call-1",
    title: "laravel-boost-database-query: database-query",
    options: ["allow-once", "reject-once"],
    outcome,
  };
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
    expect(mergePendingTurn([user("srv", "Add a quotes page")], pending)).toEqual([
      user("srv", "Add a quotes page"),
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
    expect(upsertSessionEvent([done], running)).toEqual([done]);
    expect(
      upsertSessionEvent(once, {
        type: "available_skills",
        id: "s1",
        at: "t",
        commands: [{ name: "create-skill", description: "Create a skill" }],
      }),
    ).toEqual(once);
  });

  it("replaces a pending permission with the same id outcome", () => {
    const pendingCard = permission("p1");
    const allowed = permission("p1", "allow-once");
    expect(upsertSessionEvent([pendingCard], allowed)).toEqual([allowed]);
    expect(upsertSessionEvent([allowed], pendingCard)).toEqual([allowed]);
  });

  it("keeps a websocket-only permission when merging a stale GET", () => {
    const local = [user("u", "hi"), permission("p1")];
    const server = [user("u", "hi")];
    expect(mergeSessionEvents(server, local).map((event) => event.type)).toEqual(["user_message", "permission"]);
  });

  it("ignores socket control frames", () => {
    expect(isLiveSessionEvent({ type: "pong" })).toBe(false);
    expect(isLiveSessionEvent({ type: "error", status: 401, message: "unauthorized" })).toBe(false);
    expect(isLiveSessionEvent(permission("p1"))).toBe(true);
    expect(isLiveSessionEvent({ ...permission("p1"), sessionId: "s1", workspaceId: "w1" })).toBe(true);
  });

  it("caps reconnect backoff", () => {
    expect(nextReconnectDelay(500)).toBe(1_000);
    expect(nextReconnectDelay(CHAT_RECONNECT_MAX_MS)).toBe(CHAT_RECONNECT_MAX_MS);
  });

  it("treats a live run as busy until failure or a terminal run status", () => {
    const running: SessionEvent[] = [
      user("u", "hi"),
      { type: "run", id: "r1", at: "t", v: 1, runId: "run-1", status: "running" },
    ];
    expect(isSessionRunActive(running)).toBe(true);
    expect(isComposerBusy({ events: running })).toBe(true);
    expect(shouldShowWorking({ inFlight: true, events: [user("u", "hi")] })).toBe(true);
    expect(shouldShowWorking({ inFlight: true, events: [...running, permission("p1")] })).toBe(false);
    expect(
      isSessionRunActive([
        ...running,
        { type: "run_failure", id: "f1", at: "t", v: 1, kind: "provider_failed", message: "timed out" },
      ]),
    ).toBe(false);
    expect(isComposerBusy({ events: [], pendingStatus: "sending" })).toBe(true);
  });
});
