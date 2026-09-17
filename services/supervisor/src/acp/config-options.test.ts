import { describe, expect, it } from "vitest";
import {
  configOptionId,
  currentModelId,
  findModelOption,
  modelOptionValues,
  readConfigOptions,
  resolveModelValue,
} from "./config-options.js";

const v1Result = {
  sessionId: "sess-1",
  configOptions: [
    { id: "mode", name: "Session Mode", category: "mode", type: "select", currentValue: "ask" },
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "claude-sonnet-4-6",
      options: [
        { value: "claude-sonnet-4-6", name: "Sonnet", description: "Balanced" },
        { value: "claude-opus-4-6", name: "Opus" },
      ],
    },
  ],
};

describe("acp config options", () => {
  it("reads the model option from a v1 session result", () => {
    const options = readConfigOptions(v1Result);
    expect(options).toHaveLength(2);
    const model = findModelOption(options);
    expect(configOptionId(model!)).toBe("model");
    expect(currentModelId(model)).toBe("claude-sonnet-4-6");
    expect(modelOptionValues(model)).toEqual([
      { id: "claude-sonnet-4-6", label: "Sonnet", description: "Balanced" },
      { id: "claude-opus-4-6", label: "Opus", description: undefined },
    ]);
  });

  it("reads the model option from a v2 configId payload", () => {
    const options = readConfigOptions({ configOptions: [{ configId: "model", category: "model", currentValue: "m1" }] });
    expect(configOptionId(findModelOption(options)!)).toBe("model");
  });

  it("tolerates agents that advertise nothing", () => {
    expect(readConfigOptions(undefined)).toEqual([]);
    expect(readConfigOptions({ sessionId: "s" })).toEqual([]);
    expect(findModelOption([])).toBeUndefined();
    expect(currentModelId(undefined)).toBeUndefined();
  });

  it("matches a pinned model by id, label, or prefix and passes unknown ids through", () => {
    const model = findModelOption(readConfigOptions(v1Result));
    expect(resolveModelValue(model, "claude-opus-4-6")).toBe("claude-opus-4-6");
    expect(resolveModelValue(model, "OPUS")).toBe("claude-opus-4-6");
    expect(resolveModelValue(model, "claude-sonnet")).toBe("claude-sonnet-4-6");
    expect(resolveModelValue(model, "gpt-5")).toBe("gpt-5");
    expect(resolveModelValue(undefined, "gpt-5")).toBe("gpt-5");
  });
});
