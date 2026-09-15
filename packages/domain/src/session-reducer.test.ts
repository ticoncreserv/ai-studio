import { describe, expect, it } from "vitest";
import { applyFileDecision, applyHunkDecision, emptySession, reduceSession } from "./session-reducer.js";

describe("session reducer", () => {
  it("appends user and assistant text", () => {
    let state = emptySession();
    state = reduceSession(state, {
      type: "user_message",
      id: "u1",
      at: "t",
      text: "Hello",
      attachments: [],
      mentions: [],
    });
    state = reduceSession(state, {
      type: "assistant_delta",
      id: "a1",
      at: "t",
      text: "Hi",
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]?.text).toBe("Hi");
  });

  it("accepts hunks and files", () => {
    let state = emptySession();
    state = reduceSession(state, {
      type: "diff",
      id: "d1",
      at: "t",
      filePath: "app/Models/User.php",
      hunks: [
        {
          id: "h1",
          filePath: "app/Models/User.php",
          oldStart: 1,
          newStart: 1,
          oldLines: "a",
          newLines: "b",
          status: "pending",
        },
      ],
    });
    state = applyHunkDecision(state, "h1", "accepted");
    expect(state.hunks[0]?.status).toBe("accepted");
    state = applyFileDecision(state, "app/Models/User.php", "rejected");
    expect(state.hunks[0]?.status).toBe("rejected");
  });
});
