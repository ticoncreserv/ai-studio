import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { cursorAccountHome, cursorAgentEnv, cursorProbeHome, hasCursorApiKey, preferredAgentProvider, resolveSessionProvider } from "./env.js";

describe("cursor agent env", () => {
  it("prefers cursor only when an API key is present", () => {
    expect(hasCursorApiKey({ CURSOR_API_KEY: "crsr_test" })).toBe(true);
    expect(hasCursorApiKey({ CURSOR_API_KEY_2: "crsr_backup" })).toBe(true);
    expect(preferredAgentProvider({})).toBe("cursor");
    expect(preferredAgentProvider({ VITEST: "true" })).toBe("mock");
    expect(preferredAgentProvider({ CURSOR_API_KEY: "crsr_test" })).toBe("cursor");
  });

  it("keeps explicit mock under vitest and upgrades leftover mock sessions in production", () => {
    expect(resolveSessionProvider("mock", { VITEST: "true", CURSOR_API_KEY: "crsr_test" })).toBe("mock");
    expect(resolveSessionProvider("mock", { CURSOR_API_KEY: "crsr_test" })).toBe("cursor");
    expect(resolveSessionProvider("cursor", {})).toBe("cursor");
    expect(resolveSessionProvider("claude", { CURSOR_API_KEY: "crsr_test" })).toBe("claude");
    expect(resolveSessionProvider("codex", { CURSOR_API_KEY: "crsr_test" })).toBe("codex");
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
    expect(env.HOME).toContain("default");
    expect(env.AGENT_CLI_CREDENTIAL_STORE).toBe("file");
  });

  it("uses an isolated HOME per CLI account and omits the API key on CLI runs", () => {
    const env = cursorAgentEnv(
      { CURSOR_API_KEY: "crsr_test", PATH: "/usr/bin" },
      { home: "/tmp/cursor-home/work", apiKey: false },
    );
    expect(env.HOME).toBe("/tmp/cursor-home/work");
    expect(env.CURSOR_API_KEY).toBeUndefined();
    expect(env.AGENT_CLI_CREDENTIAL_STORE).toBe("file");
    expect(cursorProbeHome({ ATELIER_CURSOR_HOME: "/tmp/cursor-home" })).toBe("/tmp/cursor-home/.probe");
    expect(cursorAccountHome("account-2", { ATELIER_CURSOR_HOME: "/tmp/cursor-home" })).toBe(
      "/tmp/cursor-home/account-2",
    );
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
