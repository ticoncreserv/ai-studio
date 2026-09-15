import { describe, expect, it } from "vitest";
import { estimateTokens, packPrompt, titleFromPrompt } from "./context.js";

describe("prompt envelope", () => {
  it("omits lower-priority blocks when over budget", () => {
    const packed = packPrompt(
      [
        { id: "rules", kind: "rules", text: "RULES", tokens: 10, priority: 1 },
        { id: "user", kind: "user", text: "USER", tokens: 10, priority: 0 },
        { id: "pdf", kind: "attachments", text: "PDF", tokens: 50, priority: 5 },
      ],
      25,
    );
    expect(packed.text).toContain("USER");
    expect(packed.omitted).toContain("attachments:pdf");
  });

  it("titles a session from the first prompt", () => {
    expect(titleFromPrompt("Create an Inertia page for quotes")).toBe("Create an Inertia page for quotes");
    expect(estimateTokens("abcd")).toBe(1);
  });
});
