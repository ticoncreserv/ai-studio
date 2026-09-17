import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCursorCliAccount, emptyProviderKeyState, markProviderKeyFailure } from "@atelier/domain";
import {
  CursorCliLoginLock,
  cursorAuthCandidates,
  extractCursorLoginUrl,
  migrateLegacyCursorHome,
  seedDefaultCursorCliAccount,
} from "./cursor-cli.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("cursor CLI home migration", () => {
  it("moves a flat cursor-home into the default account directory", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-cursor-home-"));
    dirs.push(root);
    writeFileSync(join(root, "session.json"), "token");
    mkdirSync(join(root, ".cursor"));
    writeFileSync(join(root, ".cursor", "auth"), "ok");
    const result = migrateLegacyCursorHome(root);
    expect(result).toEqual({ migrated: true, accountId: "default" });
    expect(readFileSync(join(root, "default", "session.json"), "utf8")).toBe("token");
    expect(readFileSync(join(root, "default", ".cursor", "auth"), "utf8")).toBe("ok");
    expect(seedDefaultCursorCliAccount([], true)[0]?.id).toBe("default");
  });

  it("leaves an already-nested home alone", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-cursor-home-nested-"));
    dirs.push(root);
    mkdirSync(join(root, "default"), { recursive: true });
    writeFileSync(join(root, "default", "keep"), "1");
    expect(migrateLegacyCursorHome(root)).toEqual({ migrated: false, accountId: "default" });
    expect(readFileSync(join(root, "default", "keep"), "utf8")).toBe("1");
    expect(seedDefaultCursorCliAccount([], false)).toEqual([]);
  });
});

describe("cursor auth candidates", () => {
  it("tries signed-in CLI accounts before API keys", () => {
    const now = new Date("2026-09-17T10:00:00.000Z");
    const accounts = [
      { ...emptyCursorCliAccount("default"), loggedIn: true },
      emptyCursorCliAccount("account-2"),
      { ...emptyCursorCliAccount("account-3"), loggedIn: true },
    ];
    const keys = [
      markProviderKeyFailure(emptyProviderKeyState("CURSOR_API_KEY"), { message: "401 Unauthorized", now }),
      emptyProviderKeyState("CURSOR_API_KEY_2"),
    ];
    const candidates = cursorAuthCandidates({
      accounts,
      keys,
      credentials: [
        { ref: "CURSOR_API_KEY", value: "one" },
        { ref: "CURSOR_API_KEY_2", value: "two" },
      ],
      env: { ATELIER_CURSOR_HOME: "/tmp/cursor-home" },
      now,
    });
    expect(candidates.map((row) => row.ref)).toEqual([
      "cli:default",
      "cli:account-3",
      "CURSOR_API_KEY_2",
      "CURSOR_API_KEY",
    ]);
    expect(candidates[0]).toMatchObject({ kind: "cli", home: "/tmp/cursor-home/default" });
    expect(candidates[2]).toMatchObject({ kind: "key", value: "two" });
  });
});

describe("cursor CLI login", () => {
  it("extracts a login URL from CLI output", () => {
    expect(
      extractCursorLoginUrl("Visit https://cursor.com/loginDeepControl?challenge=abc to continue.\n"),
    ).toBe("https://cursor.com/loginDeepControl?challenge=abc");
  });

  it("rejects a second account while one login is in flight and returns the URL", async () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-cursor-login-"));
    dirs.push(root);
    const first = fakeProc();
    const spawned: string[][] = [];
    const spawnedEnv: NodeJS.ProcessEnv[] = [];
    const lock = new CursorCliLoginLock((_command, args, env) => {
      spawned.push(args);
      spawnedEnv.push(env);
      return first.proc as unknown as import("node:child_process").ChildProcess;
    });
    const started = lock.start({
      accountId: "default",
      command: "/usr/bin/agent",
      env: { ATELIER_CURSOR_HOME: root, PATH: "/usr/bin" },
    });
    expect(started.accountId).toBe("default");
    first.emit("https://cursor.com/loginDeepControl?challenge=1\n");
    expect(lock.state?.loginUrl).toBe("https://cursor.com/loginDeepControl?challenge=1");
    expect(() =>
      lock.start({ accountId: "account-2", command: "/usr/bin/agent", env: { ATELIER_CURSOR_HOME: root } }),
    ).toThrow(/already signing in/i);
    expect(lock.start({ accountId: "default", command: "/usr/bin/agent", env: { ATELIER_CURSOR_HOME: root } }).accountId).toBe(
      "default",
    );
    expect(spawned).toEqual([["login"]]);
    expect(spawnedEnv[0]?.AGENT_CLI_CREDENTIAL_STORE).toBe("file");
    expect(spawnedEnv[0]?.HOME).toBe(join(root, "default"));
    lock.stop();
  });
});

function fakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: (signal?: string) => boolean;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {
    proc.emit("exit", 0);
    return true;
  };
  return {
    proc,
    emit(text: string) {
      proc.stdout.emit("data", text);
    },
  };
}
