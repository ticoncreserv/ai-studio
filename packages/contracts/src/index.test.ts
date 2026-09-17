import { describe, expect, it } from "vitest";
import { ClientCommandSchema, SessionEventSchema } from "./index.js";

describe("contracts", () => {
  it("parses a prompt command and a diff event", () => {
    const command = ClientCommandSchema.parse({ type: "prompt", text: "Add quotes" });
    if (command.type !== "prompt") throw new Error("expected prompt");
    expect(command.attachments).toEqual([]);
    const event = SessionEventSchema.parse({
      type: "diff",
      id: "d1",
      at: "t",
      filePath: "a.vue",
      hunks: [
        {
          id: "h1",
          filePath: "a.vue",
          oldStart: 0,
          newStart: 1,
          oldLines: "",
          newLines: "x",
          status: "pending",
        },
      ],
    });
    if (event.type !== "diff") throw new Error("expected diff");
    expect(event.hunks).toHaveLength(1);
  });

  it("parses available_skills and an optional skill on prompt", () => {
    const event = SessionEventSchema.parse({
      type: "available_skills",
      id: "s1",
      at: "t",
      commands: [{ name: "create-skill", description: "Create a skill" }],
    });
    if (event.type !== "available_skills") throw new Error("expected available_skills");
    expect(event.commands[0]?.name).toBe("create-skill");
    const command = ClientCommandSchema.parse({ type: "prompt", text: "/land-it", skill: "land-it" });
    if (command.type !== "prompt") throw new Error("expected prompt");
    expect(command.skill).toBe("land-it");
  });

  it("parses proposal events and discard commands", () => {
    const event = SessionEventSchema.parse({
      type: "proposal",
      id: "p1",
      at: "t",
      runId: "r1",
      baseSha: "abc",
      proposalSha: "def",
      files: ["app/Models/User.php"],
    });
    if (event.type !== "proposal") throw new Error("expected proposal");
    expect(event.files).toEqual(["app/Models/User.php"]);
    expect(ClientCommandSchema.parse({ type: "discard_proposal" }).type).toBe("discard_proposal");
    expect(ClientCommandSchema.parse({ type: "push_studio" }).type).toBe("push_studio");
  });
});
