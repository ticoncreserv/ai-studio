import { describe, expect, it } from "vitest";
import { foldEvents } from "@atelier/domain";
import type { SessionEvent } from "@atelier/contracts";

describe("studio snapshot", () => {
  it("folds timeline events for the workspace page", () => {
    const events: SessionEvent[] = [
      { type: "user_message", id: "u", at: "t", text: "Add quotes", attachments: [], mentions: [] },
      { type: "assistant_message", id: "a", at: "t", text: "Working", streaming: false },
    ];
    expect(foldEvents(events).messages).toHaveLength(2);
  });
});
