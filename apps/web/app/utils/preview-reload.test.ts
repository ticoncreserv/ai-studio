import { describe, expect, it } from "vitest";
import { nextPreviewEventId, shouldReloadPreviewOnCommand, shouldReloadPreviewOnEvent } from "./preview-reload";

describe("preview reload policy", () => {
  it("does not reload the iframe on failed or no-op prompt events", () => {
    expect(shouldReloadPreviewOnEvent("assistant_message")).toBe(false);
    expect(shouldReloadPreviewOnEvent("user_message")).toBe(false);
    expect(shouldReloadPreviewOnEvent("runtime_error")).toBe(false);
    expect(shouldReloadPreviewOnCommand("prompt")).toBe(false);
    expect(
      nextPreviewEventId(
        [
          { id: "u", type: "user_message" },
          { id: "a", type: "assistant_message" },
        ],
        "",
      ),
    ).toBeNull();
  });

  it("reloads only when the worktree changed or the user applies a file command", () => {
    expect(shouldReloadPreviewOnEvent("diff")).toBe(true);
    expect(shouldReloadPreviewOnEvent("checkpoint")).toBe(true);
    expect(shouldReloadPreviewOnCommand("accept_hunk")).toBe(true);
    expect(shouldReloadPreviewOnCommand("restore_checkpoint")).toBe(true);
    expect(nextPreviewEventId([{ id: "d1", type: "diff" }], "")).toBe("d1");
    expect(nextPreviewEventId([{ id: "d1", type: "diff" }], "d1")).toBeNull();
  });
});
