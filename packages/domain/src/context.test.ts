import { describe, expect, it } from "vitest";
import { estimateTokens, packPrompt, promptPrefixForMode, titleFromPrompt, visiblePromptText, withInspectPrompt } from "./context.js";

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

  it("never drops the current user request", () => {
    const packed = packPrompt(
      [
        { id: "user", kind: "user", text: "A".repeat(200), tokens: 50, priority: 0 },
        { id: "rules", kind: "rules", text: "RULES", tokens: 10, priority: 1 },
      ],
      25,
    );
    expect(packed.text).toBe("A".repeat(200));
    expect(packed.omitted).toEqual(["rules:rules"]);
    expect(packed.usedTokens).toBe(50);
  });

  it("titles a session from the first prompt", () => {
    expect(titleFromPrompt("Create an Inertia page for quotes")).toBe("Create an Inertia page for quotes");
    expect(titleFromPrompt(`${promptPrefixForMode("ask")}pong`)).toBe("pong");
    expect(visiblePromptText(`${promptPrefixForMode("plan")}Add a quotes page`)).toBe("Add a quotes page");
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("hides inspect facts from the typed prompt until they are packed for the agent", () => {
    expect(withInspectPrompt("What is this?", ["- tag: button"])).toBe("What is this?\n\n- tag: button");
    expect(withInspectPrompt("", ["- tag: button"])).toBe("- tag: button");
    expect(withInspectPrompt("What is this?", [])).toBe("What is this?");
  });
});
