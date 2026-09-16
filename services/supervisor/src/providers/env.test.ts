import { describe, expect, it } from "vitest";
import { cursorAgentEnv, hasCursorApiKey, preferredAgentProvider, resolveSessionProvider } from "./env.js";

describe("cursor agent env", () => {
  it("prefers cursor only when an API key is present", () => {
    expect(hasCursorApiKey({ CURSOR_API_KEY: "crsr_test" })).toBe(true);
    expect(preferredAgentProvider({})).toBe("mock");
    expect(preferredAgentProvider({ CURSOR_API_KEY: "crsr_test" })).toBe("cursor");
  });

  it("keeps explicit mock under vitest and upgrades leftover mock sessions in production", () => {
    expect(resolveSessionProvider("mock", { VITEST: "true", CURSOR_API_KEY: "crsr_test" })).toBe("mock");
    expect(resolveSessionProvider("mock", { CURSOR_API_KEY: "crsr_test" })).toBe("cursor");
    expect(resolveSessionProvider("cursor", {})).toBe("cursor");
  });

  it("strips Origin-scoped Cursor session vars so CURSOR_API_KEY wins", () => {
    const env = cursorAgentEnv({
      CURSOR_API_KEY: "crsr_test",
      CURSOR_AUTH_TOKEN: "eyJhbGciOi.origin",
      CURSOR_CONVERSATION_ID: "bc-test",
      CURSOR_REQUEST_ID: "req",
      CURSOR_AGENT: "1",
      PATH: "/usr/bin",
    });
    expect(env.CURSOR_API_KEY).toBe("crsr_test");
    expect(env.CURSOR_AUTH_TOKEN).toBeUndefined();
    expect(env.CURSOR_AGENT).toBeUndefined();
    expect(env.PATH?.startsWith(`${process.env.HOME}/.local/bin`)).toBe(true);
  });
});
