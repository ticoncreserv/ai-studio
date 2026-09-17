import { describe, expect, it } from "vitest";
import { ClientCommandSchema, CursorCliAccountSchema, FeatureFlagSchema, ProviderCapabilitySchema, ProviderHealthSchema, ProviderKeyStateSchema, SessionEventSchema, UsageLimitsSchema } from "./index.js";

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

  it("parses inspect pins on a prompt without putting them in the typed text", () => {
    const command = ClientCommandSchema.parse({
      type: "prompt",
      text: "What is this heading?",
      inspect: [{ label: "Button", note: "- tag: button\n- selector: button.primary" }],
    });
    if (command.type !== "prompt") throw new Error("expected prompt");
    expect(command.text).toBe("What is this heading?");
    expect(command.inspect).toEqual([{ label: "Button", note: "- tag: button\n- selector: button.primary" }]);
    const event = SessionEventSchema.parse({
      type: "user_message",
      id: "u1",
      at: "t",
      text: "What is this heading?",
      inspect: [{ label: "Button", note: "- tag: button" }],
    });
    if (event.type !== "user_message") throw new Error("expected user_message");
    expect(event.inspect?.[0]?.label).toBe("Button");
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

  it("parses sandbox and provider health contracts", () => {
    expect(FeatureFlagSchema.parse("sandboxRequired")).toBe("sandboxRequired");
    expect(FeatureFlagSchema.parse("claudeProvider")).toBe("claudeProvider");
    expect(FeatureFlagSchema.parse("codexProvider")).toBe("codexProvider");
    expect(ProviderHealthSchema.parse({
      id: "claude",
      status: "unconfigured",
      binary: false,
      hasCredential: false,
      sandbox: "best-effort",
    }).status).toBe("unconfigured");
    const key = ProviderKeyStateSchema.parse({ ref: "CURSOR_API_KEY" });
    expect(key).toMatchObject({ enabled: true, failures: 0, cooldownUntil: null });
    const cli = CursorCliAccountSchema.parse({ id: "default" });
    expect(cli).toMatchObject({ enabled: true, loggedIn: false, account: null, failures: 0 });
    const failover = SessionEventSchema.parse({
      type: "run_failure",
      id: "f1",
      at: "t",
      kind: "provider_failover",
      message: "quota",
    });
    expect(failover.type === "run_failure" && failover.kind === "provider_failover").toBe(true);
    expect(ProviderCapabilitySchema.parse({
      id: "cursor",
      label: "Cursor",
      command: "agent",
      args: ["acp"],
      modes: ["agent"],
      images: true,
      todos: true,
      plans: true,
      questions: true,
      model: "gpt-5",
    }).model).toBe("gpt-5");
  });

  it("keeps only monthly tokens on a usage limit object", () => {
    expect(UsageLimitsSchema.parse({
      monthlyTokens: 5_000_000,
      dailyTokens: 500_000,
      perRunTokens: 200_000,
      perRunToolCalls: 40,
      monthlyCostUsd: 12,
    })).toEqual({ monthlyTokens: 5_000_000 });
  });
});
