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
});
