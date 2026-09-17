import { describe, expect, it } from "vitest";
import { PREVIEW_WAIT_ROOT_ID, previewUnavailableFromDocument } from "./preview-frame-state";

function doc(root?: { phase?: string; reason?: string | null } | null) {
  return {
    getElementById(id: string) {
      if (!root || id !== PREVIEW_WAIT_ROOT_ID) return null;
      return {
        getAttribute(name: string) {
          if (name === "data-phase") return root.phase ?? null;
          if (name === "data-reason") return root.reason ?? null;
          return null;
        },
      };
    },
  } as unknown as Document;
}

describe("preview iframe unavailable page", () => {
  it("ignores a live wait overlay and empty documents", () => {
    expect(previewUnavailableFromDocument(null)).toBeNull();
    expect(previewUnavailableFromDocument(doc(null))).toBeNull();
    expect(previewUnavailableFromDocument(doc({ phase: "boot" }))).toBeNull();
  });

  it("reads the reason from the studio unavailable document", () => {
    expect(previewUnavailableFromDocument(doc({ phase: "error", reason: "hibernated" }))).toBe("hibernated");
    expect(previewUnavailableFromDocument(doc({ phase: "error", reason: "down" }))).toBe("down");
    expect(previewUnavailableFromDocument(doc({ phase: "error" }))).toBe("down");
  });
});
