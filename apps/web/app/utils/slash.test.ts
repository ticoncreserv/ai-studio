import { describe, expect, it } from "vitest";
import {
  committedSlashSkill,
  composePromptWithSkill,
  composerVisiblePrompt,
  insertSlashCommand,
  mcpServerFromToolName,
  mergeSlashCatalog,
  removeSlashCommand,
  resolvedSlashSkill,
  shouldClearSkillToken,
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

  it("only tokens a slash command that exists in the catalog after a trailing space", () => {
    const names = ["caveman", "inertia-crud"];
    expect(committedSlashSkill("/caveman", names)).toBeNull();
    expect(committedSlashSkill("/caveman ", names)).toBe("caveman");
    expect(committedSlashSkill("/caveman do this", names)).toBe("caveman");
    expect(committedSlashSkill("/nope ", names)).toBeNull();
    expect(resolvedSlashSkill("/caveman", names)).toBe("caveman");
    expect(resolvedSlashSkill("/nope extra", names)).toBeNull();
    expect(composerVisiblePrompt("/caveman do this", "caveman")).toBe("do this");
    expect(composePromptWithSkill("caveman", "do this")).toBe("/caveman do this");
    expect(composePromptWithSkill("caveman", "")).toBe("/caveman ");
    expect(
      shouldClearSkillToken({ key: "Backspace", selectionStart: 0, selectionEnd: 0, hasSkill: true }),
    ).toBe(true);
    expect(
      shouldClearSkillToken({ key: "Backspace", selectionStart: 1, selectionEnd: 1, hasSkill: true }),
    ).toBe(false);
    expect(
      shouldClearSkillToken({ key: "Delete", selectionStart: 0, selectionEnd: 0, hasSkill: true }),
    ).toBe(false);
  });

  it("reads the MCP server label from a tool name", () => {
    expect(mcpServerFromToolName("mcp_laravel-boost_database-query")).toBe("laravel-boost");
    expect(mcpServerFromToolName("mcp-fixture-docs_search")).toBe("fixture-docs");
    expect(mcpServerFromToolName("Read")).toBeNull();
  });
});
