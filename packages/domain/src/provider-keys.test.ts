import { describe, expect, it } from "vitest";
import {
  classifyProviderKeyFailure,
  emptyProviderKeyState,
  isProviderKeyFailure,
  isProviderKeyUsable,
  markProviderKeyFailure,
  markProviderKeySuccess,
  moveProviderKey,
  nextProviderKeyRef,
  orderProviderKeys,
  providerKeyRef,
  providerKeySlot,
  PROVIDER_KEY_MAX_FAILURES,
  resetProviderKey,
} from "./provider-keys.js";

describe("provider key refs", () => {
  it("keeps the historical name for the first slot", () => {
    expect(providerKeyRef("CURSOR_API_KEY", 1)).toBe("CURSOR_API_KEY");
    expect(providerKeyRef("CURSOR_API_KEY", 3)).toBe("CURSOR_API_KEY_3");
    expect(providerKeySlot("CURSOR_API_KEY", "CURSOR_API_KEY")).toBe(1);
    expect(providerKeySlot("CURSOR_API_KEY", "CURSOR_API_KEY_4")).toBe(4);
    expect(providerKeySlot("CURSOR_API_KEY", "ANTHROPIC_API_KEY")).toBe(0);
    expect(providerKeySlot("CURSOR_API_KEY", "CURSOR_API_KEY_0")).toBe(0);
  });

  it("reuses the lowest free slot", () => {
    expect(nextProviderKeyRef("XAI_API_KEY", [])).toBe("XAI_API_KEY");
    expect(nextProviderKeyRef("XAI_API_KEY", ["XAI_API_KEY"])).toBe("XAI_API_KEY_2");
    expect(nextProviderKeyRef("XAI_API_KEY", ["XAI_API_KEY", "XAI_API_KEY_3"])).toBe("XAI_API_KEY_2");
  });
});

describe("provider key failure classification", () => {
  it("recognizes the messages that mean another key is worth trying", () => {
    expect(classifyProviderKeyFailure("HTTP 429 Too Many Requests")).toBe("rate_limit");
    expect(classifyProviderKeyFailure("rate limit exceeded")).toBe("rate_limit");
    expect(classifyProviderKeyFailure("insufficient credit balance")).toBe("quota");
    expect(classifyProviderKeyFailure("monthly quota reached")).toBe("quota");
    expect(
      classifyProviderKeyFailure(
        "Authentication failed: your Cursor credentials or API key are invalid or expired.",
      ),
    ).toBe("auth");
    expect(classifyProviderKeyFailure("ACP process exited (1): 401 Unauthorized")).toBe("auth");
    expect(classifyProviderKeyFailure("ANTHROPIC_API_KEY is not set")).toBe("auth");
  });

  it("leaves unrelated failures alone", () => {
    expect(classifyProviderKeyFailure("gemini is not on PATH")).toBeNull();
    expect(isProviderKeyFailure("ACP session/prompt timed out after 30000ms")).toBe(false);
    expect(isProviderKeyFailure("")).toBe(false);
  });
});

describe("provider key rotation", () => {
  const now = new Date("2026-09-17T10:00:00.000Z");

  it("cools a failed key down and skips it while another key is usable", () => {
    const first = markProviderKeyFailure(emptyProviderKeyState("CURSOR_API_KEY", "primary"), {
      message: "401 Unauthorized",
      now,
    });
    const second = emptyProviderKeyState("CURSOR_API_KEY_2", "backup");
    expect(isProviderKeyUsable(first, now)).toBe(false);
    expect(orderProviderKeys([first, second], now).map((row) => row.ref)).toEqual([
      "CURSOR_API_KEY_2",
      "CURSOR_API_KEY",
    ]);
    const later = new Date(now.getTime() + 61 * 60 * 1000);
    expect(isProviderKeyUsable(first, later)).toBe(true);
    expect(orderProviderKeys([first, second], later).map((row) => row.ref)).toEqual([
      "CURSOR_API_KEY",
      "CURSOR_API_KEY_2",
    ]);
  });

  it("still offers a cooling key when it is the only one left", () => {
    const only = markProviderKeyFailure(emptyProviderKeyState("XAI_API_KEY"), { message: "429", now });
    expect(orderProviderKeys([only], now).map((row) => row.ref)).toEqual(["XAI_API_KEY"]);
  });

  it("drops a key from the rotation after repeated failures and restores it on reset", () => {
    let key = emptyProviderKeyState("GEMINI_API_KEY");
    for (let i = 0; i < PROVIDER_KEY_MAX_FAILURES; i += 1) {
      key = markProviderKeyFailure(key, { message: "403 Forbidden", now });
    }
    const later = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(isProviderKeyUsable(key, later)).toBe(false);
    expect(isProviderKeyUsable(resetProviderKey(key), later)).toBe(true);
  });

  it("clears the failure trail on a successful run", () => {
    const failed = markProviderKeyFailure(emptyProviderKeyState("ANTHROPIC_API_KEY"), {
      message: "quota exceeded",
      now,
    });
    const healthy = markProviderKeySuccess(failed, now);
    expect(healthy).toMatchObject({ failures: 0, cooldownUntil: null, lastError: null, lastFailureKind: null });
    expect(healthy.lastUsedAt).toBe(now.toISOString());
  });

  it("ignores a disabled key entirely", () => {
    const disabled = { ...emptyProviderKeyState("CURSOR_API_KEY_2"), enabled: false };
    expect(orderProviderKeys([emptyProviderKeyState("CURSOR_API_KEY"), disabled])).toHaveLength(1);
  });

  it("moves a key inside the roster", () => {
    const keys = [
      emptyProviderKeyState("CURSOR_API_KEY"),
      emptyProviderKeyState("CURSOR_API_KEY_2"),
      emptyProviderKeyState("CURSOR_API_KEY_3"),
    ];
    expect(moveProviderKey(keys, "CURSOR_API_KEY_3", "up").map((row) => row.ref)).toEqual([
      "CURSOR_API_KEY",
      "CURSOR_API_KEY_3",
      "CURSOR_API_KEY_2",
    ]);
    expect(moveProviderKey(keys, "CURSOR_API_KEY", "up").map((row) => row.ref)).toEqual(keys.map((row) => row.ref));
    expect(moveProviderKey(keys, "missing", "down").map((row) => row.ref)).toEqual(keys.map((row) => row.ref));
  });
});
