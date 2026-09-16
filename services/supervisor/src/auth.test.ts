import { describe, expect, it } from "vitest";
import { createAuthProvider, signState, verifyState } from "./auth.js";
import { signSession, verifySession } from "./session-cookie.js";

describe("auth", () => {
  it("always uses GitHub for studio login", () => {
    const previousId = process.env.GITHUB_CLIENT_ID;
    const previousSecret = process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    try {
      expect(createAuthProvider().id).toBe("github");
    } finally {
      if (previousId === undefined) delete process.env.GITHUB_CLIENT_ID;
      else process.env.GITHUB_CLIENT_ID = previousId;
      if (previousSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
      else process.env.GITHUB_CLIENT_SECRET = previousSecret;
    }
  });

  it("issues a sealed session cookie", () => {
    const cookie = signSession("user-1");
    expect(verifySession(cookie)?.userId).toBe("user-1");
    expect(verifySession("tampered")).toBeNull();
  });

  it("round-trips signed oauth state", () => {
    const signed = signState("abc", "secret");
    expect(verifyState(signed, "secret")).toBe("abc");
    expect(verifyState(signed, "other")).toBeNull();
  });
});
