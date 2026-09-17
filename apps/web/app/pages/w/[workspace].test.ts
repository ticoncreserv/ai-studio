import { describe, expect, it } from "vitest";
import { foldEvents, shouldAutoResumePreview } from "@atelier/domain";
import type { SessionEvent } from "@atelier/contracts";
import { renderMarkdown, splitDiffLines } from "../../utils/markdown";

describe("studio snapshot", () => {
  it("folds timeline events for the workspace page", () => {
    const events: SessionEvent[] = [
      { type: "user_message", id: "u", at: "t", text: "Add quotes", attachments: [], mentions: [] },
      { type: "assistant_message", id: "a", at: "t", text: "Working", streaming: false },
    ];
    expect(foldEvents(events).messages).toHaveLength(2);
  });

  it("renders escaped markdown and splits hunk lines", () => {
    expect(renderMarkdown("**ok** <script>")).toContain("<strong>ok</strong>");
    expect(renderMarkdown("**ok** <script>")).not.toContain("<script>");
    expect(splitDiffLines("old", "new")).toEqual([
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
    ]);
  });

  it("wakes a hibernated preview when opening studio unless the user pinned it", () => {
    expect(shouldAutoResumePreview({ status: "hibernated" })).toBe(true);
    expect(shouldAutoResumePreview({ status: "hibernated", hibernatedByUser: true })).toBe(false);
  });
});
