import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { cursorAgentEnv, hasCursorApiKey, preferredAgentProvider, resolveSessionProvider } from "./env.js";

describe("cursor agent env", () => {
  it("prefers cursor only when an API key is present", () => {
    expect(hasCursorApiKey({ CURSOR_API_KEY: "crsr_test" })).toBe(true);
    expect(preferredAgentProvider({})).toBe("cursor");
    expect(preferredAgentProvider({ VITEST: "true" })).toBe("mock");
    expect(preferredAgentProvider({ CURSOR_API_KEY: "crsr_test" })).toBe("cursor");
  });

  it("keeps explicit mock under vitest and upgrades leftover mock sessions in production", () => {
    expect(resolveSessionProvider("mock", { VITEST: "true", CURSOR_API_KEY: "crsr_test" })).toBe("mock");
    expect(resolveSessionProvider("mock", { CURSOR_API_KEY: "crsr_test" })).toBe("cursor");
    expect(resolveSessionProvider("cursor", {})).toBe("cursor");
    expect(resolveSessionProvider("claude", { CURSOR_API_KEY: "crsr_test" })).toBe("claude");
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
    const nvm = join(homedir(), ".nvm", "versions", "node", "v24.21.0", "bin");
    const local = join(homedir(), ".local", "bin");
    const parts = env.PATH?.split(":") ?? [];
    expect(parts[0]).toBe(nvm);
    expect(parts[1]).toBe(local);
    expect(parts).toContain("/usr/bin");
    expect(env.HOME).toContain("cursor-home");
  });

  it("moves nvm and local bin to the front even when they already appear on PATH", () => {
    const nvm = join(homedir(), ".nvm", "versions", "node", "v24.21.0", "bin");
    const local = join(homedir(), ".local", "bin");
    const env = cursorAgentEnv({
      CURSOR_API_KEY: "crsr_test",
      PATH: `/workspace/node_modules/.bin:${nvm}:${local}:/usr/bin`,
    });
    const parts = env.PATH?.split(":") ?? [];
    expect(parts.slice(0, 3)).toEqual([nvm, local, "/workspace/node_modules/.bin"]);
    expect(parts.filter((dir) => dir === nvm)).toHaveLength(1);
  });
});
