import { describe, expect, it } from "vitest";
import { LocalAuthProvider, signState, verifyState } from "./auth.js";
import { signSession, verifySession } from "./session-cookie.js";

describe("auth", () => {
  it("issues a local identity and a sealed cookie", async () => {
    const identity = await new LocalAuthProvider().completeLogin({ login: "joao", locale: "pt-BR" });
    expect(identity.login).toBe("joao");
    expect(identity.commitEmail).toContain("users.noreply.github.com");
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
