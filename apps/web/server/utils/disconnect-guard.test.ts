import { describe, expect, it } from "vitest";
import { isBenignSocketError } from "./disconnect-guard";

describe("isBenignSocketError", () => {
  it("treats peer resets and undici socket drops as benign", () => {
    expect(isBenignSocketError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(true);
    expect(isBenignSocketError(new Error("read ECONNRESET"))).toBe(true);
    expect(isBenignSocketError("write EPIPE")).toBe(true);
    expect(isBenignSocketError(Object.assign(new Error("other"), { code: "UND_ERR_SOCKET" }))).toBe(true);
    expect(
      isBenignSocketError(
        Object.assign(new Error("fetch failed"), { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) }),
      ),
    ).toBe(true);
  });

  it("leaves real failures visible", () => {
    expect(isBenignSocketError(new Error("boom"))).toBe(false);
    expect(isBenignSocketError(Object.assign(new Error("not found"), { code: "ENOENT" }))).toBe(false);
    expect(isBenignSocketError(undefined)).toBe(false);
  });
});
