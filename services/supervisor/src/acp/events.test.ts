import { describe, expect, it } from "vitest";
import { eventsFromAcpUpdate, permissionFromAcp } from "./events.js";

describe("ACP event mapping", () => {
  it("maps chunks, tools, plans, todos, and permissions", () => {
    expect(
      eventsFromAcpUpdate({
        params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "hello" } } },
      })[0],
    ).toMatchObject({ type: "assistant_delta", text: "hello" });
    expect(
      eventsFromAcpUpdate({
        params: { update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "read", status: "completed" } },
      })[0],
    ).toMatchObject({ type: "tool_call", name: "read", status: "completed" });
    expect(
      eventsFromAcpUpdate({
        params: { update: { sessionUpdate: "plan", plan: "1. do it", overview: "Ship it" } },
      })[0],
    ).toMatchObject({ type: "plan", plan: "1. do it" });
    expect(
      eventsFromAcpUpdate({
        params: { update: { sessionUpdate: "todos", entries: [{ content: "Write page", status: "pending" }] } },
      })[0],
    ).toMatchObject({ type: "todos" });
    expect(permissionFromAcp({ toolCall: { title: "shell", toolCallId: "c1" } }, 9)).toMatchObject({
      type: "permission",
      title: "shell",
      outcome: "pending",
    });
  });
});
