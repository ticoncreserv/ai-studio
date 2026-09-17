import { describe, expect, it } from "vitest";
import {
  interpretCursorApiKeyProbe,
  interpretCursorCliStatus,
  interpretCursorStatus,
  parseCursorModelList,
  probeCursorApiKeys,
  probeCursorCliAccounts,
  type CursorProbeRun,
} from "./cursor-probe.js";

describe("interpretCursorStatus", () => {
  it("treats a successful status as a signed-in CLI account", () => {
    expect(interpretCursorStatus("Logged in as team@example.com\n", "", 0)).toEqual({ ok: true });
    expect(interpretCursorCliStatus("Logged in as team@example.com\n", "", 0)).toEqual({
      loggedIn: true,
      account: "team@example.com",
    });
  });

  it("does not treat a missing CLI login as an API key failure", () => {
    expect(interpretCursorApiKeyProbe("", "not logged in", 1)).toEqual({
      ok: false,
      kind: "cli_login",
      message: "not logged in",
    });
    expect(interpretCursorApiKeyProbe("", "invalid API key", 1)).toEqual({
      ok: false,
      kind: "key",
      message: "invalid API key",
    });
    expect(
      interpretCursorApiKeyProbe("Available models\n\nauto - Auto (default)\n", "", 0),
    ).toEqual({ ok: true });
  });

  it("parses agent --list-models output into id/label rows", () => {
    expect(
      parseCursorModelList(`Available models

auto - Auto (default)
composer-2.5 - Composer 2.5
cursor-grok-4.6-high - Cursor Grok 4.6
`),
    ).toEqual([
      { id: "auto", label: "Auto" },
      { id: "composer-2.5", label: "Composer 2.5" },
      { id: "cursor-grok-4.6-high", label: "Cursor Grok 4.6" },
    ]);
  });
});

describe("probeCursorApiKeys", () => {
  it("probes each slot with --list-models in a disposable HOME and never opens a browser login", async () => {
    const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
    const run: CursorProbeRun = async (command, args, env) => {
      calls.push({ command, args, env });
      const key = args[1];
      if (key === "crsr_good") {
        return {
          status: 0,
          stdout: "Available models\n\nauto - Auto (default)\ncomposer-2.5 - Composer 2.5\n",
          stderr: "",
        };
      }
      return { status: 1, stdout: "", stderr: "invalid API key" };
    };
    const { keys, models } = await probeCursorApiKeys({
      command: "/usr/bin/agent",
      credentials: [
        { ref: "CURSOR_API_KEY", value: "crsr_good" },
        { ref: "CURSOR_API_KEY_2", value: "crsr_bad" },
      ],
      env: { PATH: "/usr/bin", HOME: "/tmp" },
      run,
    });
    expect(keys).toEqual([
      { ref: "CURSOR_API_KEY", ok: true },
      { ref: "CURSOR_API_KEY_2", ok: false, kind: "key", message: "invalid API key" },
    ]);
    expect(models).toEqual([
      { id: "auto", label: "Auto" },
      { id: "composer-2.5", label: "Composer 2.5" },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toEqual(["--api-key", "crsr_good", "--list-models"]);
    expect(calls[1]?.args).toEqual(["--api-key", "crsr_bad", "--list-models"]);
    expect(calls.every((call) => call.env.NO_OPEN_BROWSER === "1")).toBe(true);
    expect(calls.every((call) => call.env.AGENT_CLI_CREDENTIAL_STORE === "file")).toBe(true);
    expect(calls.every((call) => call.env.HOME?.includes(".probe"))).toBe(true);
    expect(calls.every((call) => call.args.includes("status") === false)).toBe(true);
    expect(calls.every((call) => call.args.includes("login") === false)).toBe(true);
  });

  it("falls back to models when --list-models is not a known command", async () => {
    const argsList: string[][] = [];
    const run: CursorProbeRun = async (_command, args) => {
      argsList.push(args);
      if (args.includes("--list-models")) return { status: 1, stdout: "", stderr: "unknown command: --list-models" };
      return { status: 0, stdout: "auto - Auto\ncomposer-2.5 - Composer 2.5\n", stderr: "" };
    };
    const { keys } = await probeCursorApiKeys({
      command: "/usr/bin/agent",
      credentials: [{ ref: "CURSOR_API_KEY", value: "crsr_test" }],
      env: { PATH: "/usr/bin" },
      run,
    });
    expect(keys).toEqual([{ ref: "CURSOR_API_KEY", ok: true }]);
    expect(argsList[0]).toEqual(["--api-key", "crsr_test", "--list-models"]);
    expect(argsList[1]).toEqual(["--api-key", "crsr_test", "models"]);
    expect(argsList.some((args) => args.includes("status") || args.includes("login"))).toBe(false);
  });

  it("does not mark a key failed when the CLI only reports not logged in", async () => {
    const { keys } = await probeCursorApiKeys({
      command: "/usr/bin/agent",
      credentials: [{ ref: "CURSOR_API_KEY", value: "crsr_test" }],
      env: { PATH: "/usr/bin" },
      run: async () => ({ status: 1, stdout: "", stderr: "not logged in" }),
    });
    expect(keys).toEqual([{ ref: "CURSOR_API_KEY", ok: false, kind: "cli_login", message: "not logged in" }]);
  });
});

describe("probeCursorCliAccounts", () => {
  it("runs agent status in each account HOME without an API key", async () => {
    const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv }> = [];
    const run: CursorProbeRun = async (_command, args, env) => {
      calls.push({ args, env });
      if (env.HOME?.endsWith("/work")) {
        return { status: 0, stdout: "Logged in as dev@example.com\n", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "not logged in" };
    };
    const results = await probeCursorCliAccounts({
      command: "/usr/bin/agent",
      accounts: [
        { id: "default", home: "/tmp/cursor-home/work" },
        { id: "account-2", home: "/tmp/cursor-home/account-2" },
      ],
      env: { PATH: "/usr/bin", CURSOR_API_KEY: "should-not-leak" },
      run,
    });
    expect(results).toEqual([
      { id: "default", loggedIn: true, account: "dev@example.com" },
      { id: "account-2", loggedIn: false, message: "not logged in" },
    ]);
    expect(calls.map((call) => call.args)).toEqual([["status"], ["status"]]);
    expect(calls.every((call) => call.env.CURSOR_API_KEY === undefined)).toBe(true);
    expect(calls.every((call) => call.env.NO_OPEN_BROWSER === "1")).toBe(true);
    expect(calls.every((call) => call.env.AGENT_CLI_CREDENTIAL_STORE === "file")).toBe(true);
  });
});
