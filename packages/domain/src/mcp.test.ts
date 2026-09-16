import { describe, expect, it } from "vitest";
import {
  interpolateMcp,
  mcpPolicyDecision,
  mergeMcpLayers,
  parseMcpConfig,
  redactMcpEntry,
  restoreRedactedMcp,
  serializeMcpConfig,
  toAcpMcpServers,
  REDACTED_MCP_VALUE,
} from "./mcp.js";

describe("mcp", () => {
  it("parses stdio and remote servers", () => {
    const entries = parseMcpConfig(
      {
        mcpServers: {
          "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"], env: { APP_ENV: "testing" } },
          linear: { url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer secret" } },
        },
      },
      "repo",
    );
    expect(entries[0]?.config).toMatchObject({ transport: "stdio", command: "php" });
    expect(entries[1]?.config).toMatchObject({ transport: "http", url: "https://mcp.linear.app/mcp" });
  });

  it("prefers repository over user over platform and honors prefs", () => {
    const { entries, shadowed } = mergeMcpLayers(
      {
        repo: parseMcpConfig({ mcpServers: { boost: { command: "php" } } }, "repo"),
        platform: parseMcpConfig({ mcpServers: { boost: { command: "npx" }, extra: { command: "node" } } }, "platform"),
        user: parseMcpConfig({ mcpServers: { boost: { command: "python" } } }, "user"),
      },
      { extra: false },
    );
    expect(entries.find((row) => row.name === "boost")?.source).toBe("repo");
    expect(entries.find((row) => row.name === "extra")?.enabled).toBe(false);
    expect(shadowed).toHaveLength(2);
  });

  it("interpolates env and workspace placeholders", () => {
    const [entry] = parseMcpConfig(
      {
        mcpServers: {
          local: {
            command: "python",
            args: ["${workspaceFolder}/tools/mcp.py"],
            env: { API_KEY: "${env:API_KEY}" },
          },
        },
      },
      "user",
    );
    const next = interpolateMcp(entry!, {
      env: { API_KEY: "abc" },
      userHome: "/home/ana",
      workspaceFolder: "/ws",
      workspaceFolderBasename: "ws",
      pathSeparator: "/",
    });
    expect(next.config.transport === "stdio" && next.config.args[0]).toBe("/ws/tools/mcp.py");
    expect(next.config.transport === "stdio" && next.config.env.API_KEY).toBe("abc");
  });

  it("drops remote servers when the agent lacks the capability", () => {
    const entries = parseMcpConfig(
      {
        mcpServers: {
          boost: { command: "php" },
          linear: { url: "https://mcp.linear.app/mcp" },
        },
      },
      "repo",
    );
    expect(toAcpMcpServers(entries, {})).toEqual([{ name: "boost", command: "php", args: [], env: [] }]);
    expect(toAcpMcpServers(entries, { http: true })).toHaveLength(2);
  });

  it("applies policy to user command servers", () => {
    const [stdio] = parseMcpConfig({ mcpServers: { evil: { command: "rm" } } }, "user");
    const [ok] = parseMcpConfig({ mcpServers: { boost: { command: "php" } } }, "user");
    const [remote] = parseMcpConfig({ mcpServers: { linear: { url: "https://mcp.linear.app" } } }, "user");
    const policy = { allowUserServers: true, allowedCommands: ["php", "npx"], allowedUrlPatterns: ["https://"] };
    expect(mcpPolicyDecision(stdio!, policy, { admin: false })).toBe("deny");
    expect(mcpPolicyDecision(ok!, policy, { admin: false })).toBe("allow");
    expect(mcpPolicyDecision(remote!, policy, { admin: false })).toBe("allow");
    expect(mcpPolicyDecision(stdio!, { ...policy, allowUserServers: false }, { admin: false })).toBe("deny");
    expect(mcpPolicyDecision(stdio!, policy, { admin: true })).toBe("allow");
  });

  it("redacts secrets and restores the masked value", () => {
    const [entry] = parseMcpConfig(
      { mcpServers: { boost: { command: "php", env: { API_KEY: "secret", APP_ENV: "local" } } } },
      "user",
    );
    const redacted = redactMcpEntry(entry!);
    expect(redacted.config.transport === "stdio" && redacted.config.env.API_KEY).toBe(REDACTED_MCP_VALUE);
    expect(redacted.config.transport === "stdio" && redacted.config.env.APP_ENV).toBe("local");
    expect(restoreRedactedMcp({ API_KEY: REDACTED_MCP_VALUE, APP_ENV: "prod" }, { API_KEY: "secret" })).toEqual({
      API_KEY: "secret",
      APP_ENV: "prod",
    });
  });

  it("preserves unknown keys when serializing", () => {
    const [entry] = parseMcpConfig(
      { mcpServers: { boost: { command: "php", auth: { CLIENT_ID: "abc" } } } },
      "repo",
    );
    expect(serializeMcpConfig([entry!]).mcpServers.boost).toMatchObject({
      command: "php",
      auth: { CLIENT_ID: "abc" },
    });
  });
});
