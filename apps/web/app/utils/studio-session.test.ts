import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@atelier/contracts";
import type { StudioSession } from "~/types/studio";
import { isStaleSessionRefresh, selectedSessionView, sessionQuery } from "./studio-session";

function session(id: string, events: SessionEvent[]): StudioSession {
  return { id, title: id, provider: "cursor", createdAt: "t", events };
}

function user(id: string): SessionEvent {
  return { type: "user_message", id, at: "t", text: id, attachments: [], mentions: [] };
}

describe("selectedSessionView", () => {
  const sessions = [session("a", [user("a1")]), session("b", [user("b1"), user("b2")])];

  it("returns the listed events for that id without an empty intermediate", () => {
    expect(selectedSessionView(sessions, "b")).toEqual({
      session: sessions[1],
      events: sessions[1]!.events,
    });
    expect(selectedSessionView(sessions, "b")?.events).toHaveLength(2);
  });

  it("is a no-op miss when the id is unknown", () => {
    expect(selectedSessionView(sessions, "missing")).toBeNull();
  });

  it("keeps a truly empty session empty", () => {
    expect(selectedSessionView([session("empty", [])], "empty")?.events).toEqual([]);
  });
});

describe("isStaleSessionRefresh", () => {
  it("keeps a refresh that still matches the active session", () => {
    expect(isStaleSessionRefresh("b", "b")).toBe(false);
    expect(isStaleSessionRefresh(undefined, "b")).toBe(false);
  });

  it("drops a refresh after the user moved to another session", () => {
    expect(isStaleSessionRefresh("a", "b")).toBe(true);
  });
});

describe("sessionQuery", () => {
  it("sets session without dropping other query keys", () => {
    expect(sessionQuery({ q: "sql", session: "old" }, "next")).toEqual({ q: "sql", session: "next" });
  });
});
