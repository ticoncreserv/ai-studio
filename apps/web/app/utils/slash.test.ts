import { describe, expect, it } from "vitest";
import {
  insertSlashCommand,
  mcpServerFromToolName,
  mergeSlashCatalog,
  removeSlashCommand,
  slashMatches,
  slashQuery,
} from "./slash";

describe("composer slash helpers", () => {
  it("opens only when the token starts the prompt", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/lan")).toBe("lan");
    expect(slashQuery("/land-it extra")).toBeNull();
    expect(slashQuery("hello /land")).toBeNull();
  });

  it("merges catalog skills with agent commands and ranks manual-only first", () => {
    const rows = mergeSlashCatalog(
      [
        { name: "review-diff", description: "Review a diff", source: "repo", enabled: true },
        { name: "inertia-crud", description: "CRUD for a model", source: "platform", manualOnly: true, enabled: true },
        { name: "off", description: "Disabled", source: "user", enabled: false },
      ],
      [
        { name: "create-skill", description: "Create a skill" },
        { name: "inertia-crud", description: "Agent duplicate" },
      ],
    );
    expect(rows.map((row) => row.name)).toEqual(["review-diff", "inertia-crud", "create-skill"]);
    expect(slashMatches(rows, "crud")[0]?.name).toBe("inertia-crud");
    expect(rows.find((row) => row.name === "create-skill")?.source).toBe("agent");
  });

  it("inserts and removes a slash command prefix", () => {
    expect(insertSlashCommand("/", "inertia-crud")).toBe("/inertia-crud ");
    expect(insertSlashCommand("/in", "inertia-crud")).toBe("/inertia-crud ");
    expect(removeSlashCommand("/inertia-crud quotes", "inertia-crud")).toBe("quotes");
    expect(removeSlashCommand("/inertia-crud ")).toBe("");
  });

  it("reads the MCP server label from a tool name", () => {
    expect(mcpServerFromToolName("mcp_laravel-boost_database-query")).toBe("laravel-boost");
    expect(mcpServerFromToolName("mcp-fixture-docs_search")).toBe("fixture-docs");
    expect(mcpServerFromToolName("Read")).toBeNull();
  });
});
