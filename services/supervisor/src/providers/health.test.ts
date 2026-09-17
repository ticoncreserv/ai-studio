import { describe, expect, it } from "vitest";
import { defaultFlags, emptyProviderKeyState, markProviderKeyFailure } from "@atelier/domain";
import { inspectProviderHealth, isProviderSelectable, listProviderHealth } from "./health.js";

describe("provider health", () => {
  it("keeps extra providers disabled until multiProvider and the provider flag are on", () => {
    const health = inspectProviderHealth("claude", defaultFlags, { ANTHROPIC_API_KEY: "sk", PATH: process.env.PATH });
    expect(health.status).toBe("disabled");
    expect(isProviderSelectable("claude", defaultFlags, { ANTHROPIC_API_KEY: "sk" })).toBe(false);
  });

  it("reports unconfigured when the flag is on but the key is missing", () => {
    const flags = { ...defaultFlags, multiProvider: true, claudeProvider: true };
    expect(inspectProviderHealth("claude", flags, { PATH: process.env.PATH }).status).toBe("unconfigured");
  });

  it("marks cursor available when a key and binary exist", () => {
    const health = inspectProviderHealth("cursor", defaultFlags, {
      CURSOR_API_KEY: "crsr_test",
      PATH: "/usr/bin",
    });
    expect(["available", "unavailable", "degraded"]).toContain(health.status);
    expect(health.hasCredential).toBe(true);
  });

  it("lists catalog health including mock under vitest", () => {
    const rows = listProviderHealth(defaultFlags, { VITEST: "true" });
    expect(rows.some((row) => row.id === "mock" && row.status === "available")).toBe(true);
    expect(rows.some((row) => row.id === "cursor")).toBe(true);
  });

  it("treats a second key slot as a credential", () => {
    const health = inspectProviderHealth("gemini", { ...defaultFlags, multiProvider: true, geminiProvider: true }, {
      GEMINI_API_KEY_2: "g-backup",
      PATH: process.env.PATH,
    });
    expect(health.hasCredential).toBe(true);
    expect(health.status).not.toBe("unconfigured");
  });

  it("degrades when every stored key is cooling down", () => {
    const now = new Date();
    const keys = [
      markProviderKeyFailure(emptyProviderKeyState("CURSOR_API_KEY"), { message: "401 Unauthorized", now }),
    ];
    const health = inspectProviderHealth(
      "cursor",
      defaultFlags,
      { CURSOR_API_KEY: "crsr_test", PATH: process.env.PATH },
      undefined,
      keys,
    );
    expect(health.status).toBe("degraded");
    expect(health.message).toMatch(/cooling down/);
  });
});
