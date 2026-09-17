import { describe, expect, it } from "vitest";
import { previewToolAfterEscape, STUDIO_SHORTCUTS } from "./studio-shortcuts";

describe("studio shortcuts", () => {
  it("lists the keyed studio commands", () => {
    expect(STUDIO_SHORTCUTS.map((row) => [row.id, row.keys])).toEqual([
      ["prompt", "⌘K"],
      ["cancel", "⌘."],
      ["mobile", "⌘1"],
      ["tablet", "⌘2"],
      ["desktop", "⌘3"],
      ["shortcuts", "⌘/"],
    ]);
  });

  it("leaves inspect on Escape", () => {
    expect(previewToolAfterEscape("inspect")).toBe("select");
    expect(previewToolAfterEscape("select")).toBe("select");
  });
});
