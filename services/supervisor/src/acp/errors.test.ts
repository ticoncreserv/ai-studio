import { describe, expect, it } from "vitest";
import { formatAgentError, toAgentError } from "./errors.js";

describe("ACP error formatting", () => {
  it("keeps Error and string messages", () => {
    expect(formatAgentError(new Error("ACP process exited (1)"))).toBe("ACP process exited (1)");
    expect(formatAgentError("CURSOR_API_KEY is not set")).toBe("CURSOR_API_KEY is not set");
  });

  it("surfaces JSON-RPC session/new MCP validation instead of a generic failure", () => {
    const error = {
      code: -32603,
      message: "Internal error",
      data: [{ path: ["mcpServers", 0], message: "Invalid input" }],
    };
    expect(formatAgentError(error)).toBe("Internal error: mcpServers.0: Invalid input");
    expect(formatAgentError(error)).not.toBe("The Cursor agent failed.");
    const wrapped = toAgentError(error);
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toContain("mcpServers");
  });

  it("falls back only when the payload has no message", () => {
    expect(formatAgentError({})).toBe("The Cursor agent failed.");
    expect(formatAgentError(null)).toBe("The Cursor agent failed.");
  });
});
