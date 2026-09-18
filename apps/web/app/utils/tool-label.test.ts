import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@atelier/contracts";
import { knownToolKind, toolCallPresentation, toolDisplayName, toolTargetLabel } from "./tool-label";

function tool(extra: Partial<Extract<SessionEvent, { type: "tool_call" }>> = {}): Extract<SessionEvent, { type: "tool_call" }> {
  return {
    type: "tool_call",
    id: "t1",
    at: "t",
    toolCallId: "c1",
    name: "Read",
    status: "completed",
    ...extra,
  };
}

describe("tool labels", () => {
  it("strips MCP prefixes and keeps the short tool name", () => {
    expect(toolDisplayName("mcp_laravel-boost_database-query")).toBe("database-query");
    expect(toolDisplayName("`Read`")).toBe("Read");
    expect(knownToolKind("read")).toBe("read");
    expect(knownToolKind("shell")).toBeNull();
  });

  it("uses the basename of a path target", () => {
    expect(toolTargetLabel("app/Models/Form.php")).toBe("Form.php");
    expect(toolTargetLabel("select * from forms")).toBe("select * from forms");
  });

  it("prefers a localized kind verb and a short target", () => {
    expect(toolCallPresentation(tool({ kind: "read", target: "app/Models/Form.php", status: "running" }))).toMatchObject({
      verbKey: "chat.tool.readRunning",
      target: "Form.php",
      title: "app/Models/Form.php",
    });
    expect(toolCallPresentation(tool({ name: "mcp_laravel-boost_database-query", target: "select 1" }))).toMatchObject({
      verbKey: null,
      name: "database-query",
      target: "select 1",
    });
  });
});
