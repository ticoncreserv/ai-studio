import { describe, expect, it } from "vitest";
import { applyModelEnv, mergeProviderModels, modelArgs, providerModelCatalog } from "./models.js";

describe("provider models", () => {
  it("passes a model as a flag only where the CLI documents one", () => {
    expect(modelArgs("cursor", "gpt-5")).toEqual(["--model", "gpt-5"]);
    expect(modelArgs("cursor", "  ")).toEqual([]);
    expect(modelArgs("claude", "opus")).toEqual([]);
    expect(modelArgs("gemini", "gemini-2.5-flash")).toEqual(["--model", "gemini-2.5-flash"]);
    expect(modelArgs("grok", "grok-4.5")).toEqual(["--model", "grok-4.5"]);
  });

  it("passes a model as an env var for the agents that read one", () => {
    expect(applyModelEnv("claude", { PATH: "/bin" }, "opus")).toEqual({ PATH: "/bin", ANTHROPIC_MODEL: "opus" });
    expect(applyModelEnv("gemini", {}, "gemini-2.5-flash").GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(applyModelEnv("grok", {}, "grok-4.5").GROK_DEFAULT_MODEL).toBe("grok-4.5");
    expect(applyModelEnv("cursor", { PATH: "/bin" }, "gpt-5")).toEqual({ PATH: "/bin" });
    expect(applyModelEnv("claude", { PATH: "/bin" }, "")).toEqual({ PATH: "/bin" });
  });

  it("merges catalog, discovered, and configured models without duplicates", () => {
    const merged = mergeProviderModels(
      providerModelCatalog("cursor"),
      [{ id: "gpt-5", label: "GPT-5 (discovered)", description: "fast" }],
      [{ id: "custom-1", label: "" }],
    );
    expect(merged.filter((row) => row.id === "gpt-5")).toHaveLength(1);
    expect(merged.find((row) => row.id === "gpt-5")?.description).toBe("fast");
    expect(merged.find((row) => row.id === "custom-1")?.label).toBe("custom-1");
  });
});
