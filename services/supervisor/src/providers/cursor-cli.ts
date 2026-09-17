import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CursorCliAccount, ProviderKeyState } from "@atelier/contracts";
import {
  cursorCliAuthRef,
  DEFAULT_CURSOR_CLI_ACCOUNT_ID,
  emptyCursorCliAccount,
  isCursorCliAccountUsable,
  isProviderKeyUsable,
  orderProviderKeys,
} from "@atelier/domain";
import type { ProviderCredential } from "./credentials.js";
import { CURSOR_HOME_PROBE_ID, cursorAccountHome, cursorAgentEnv, cursorHomeRoot } from "./env.js";

export type CursorAuthCandidate =
  | { kind: "cli"; ref: string; id: string; home: string }
  | { kind: "key"; ref: string; value: string };

export function extractCursorLoginUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return undefined;
  return match[0]!.replace(/[.,;:)+]+$/g, "");
}

export function ensureCursorAccountHome(accountId: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = cursorAccountHome(accountId, env);
  mkdirSync(home, { recursive: true });
  return home;
}

export function removeCursorAccountHome(accountId: string, env: NodeJS.ProcessEnv = process.env): void {
  const home = cursorAccountHome(accountId, env);
  if (!existsSync(home)) return;
  rmSync(home, { recursive: true, force: true });
}

/**
 * Move a pre-roster `var/cursor-home` (files at the root) into `var/cursor-home/default`.
 * Account directories and the probe HOME are left in place.
 */
export function migrateLegacyCursorHome(
  root = cursorHomeRoot(),
): { migrated: boolean; accountId: string } {
  mkdirSync(root, { recursive: true });
  const defaultHome = join(root, DEFAULT_CURSOR_CLI_ACCOUNT_ID);
  if (existsSync(defaultHome)) return { migrated: false, accountId: DEFAULT_CURSOR_CLI_ACCOUNT_ID };
  const entries = existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.name !== CURSOR_HOME_PROBE_ID)
    : [];
  if (!entries.length) return { migrated: false, accountId: DEFAULT_CURSOR_CLI_ACCOUNT_ID };
  const staging = join(root, `.migrating-${DEFAULT_CURSOR_CLI_ACCOUNT_ID}`);
  mkdirSync(staging, { recursive: true });
  for (const entry of entries) {
    renameSync(join(root, entry.name), join(staging, entry.name));
  }
  renameSync(staging, defaultHome);
  return { migrated: true, accountId: DEFAULT_CURSOR_CLI_ACCOUNT_ID };
}

export function cursorAuthCandidates(input: {
  accounts: CursorCliAccount[];
  keys: ProviderKeyState[];
  credentials: ProviderCredential[];
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): CursorAuthCandidate[] {
  const now = input.now ?? new Date();
  const stored = new Map(input.credentials.map((row) => [row.ref, row.value]));
  const cliUsable: CursorAuthCandidate[] = [];
  const cliCooling: CursorAuthCandidate[] = [];
  for (const account of input.accounts) {
    if (!account.enabled || !account.loggedIn) continue;
    const candidate: CursorAuthCandidate = {
      kind: "cli",
      ref: cursorCliAuthRef(account.id),
      id: account.id,
      home: cursorAccountHome(account.id, input.env),
    };
    if (isCursorCliAccountUsable(account, now)) cliUsable.push(candidate);
    else cliCooling.push(candidate);
  }
  const keyUsable: CursorAuthCandidate[] = [];
  const keyCooling: CursorAuthCandidate[] = [];
  const seen = new Set<string>();
  for (const key of orderProviderKeys(input.keys, now)) {
    const value = stored.get(key.ref);
    if (!value) continue;
    seen.add(key.ref);
    const candidate: CursorAuthCandidate = { kind: "key", ref: key.ref, value };
    if (isProviderKeyUsable(key, now)) keyUsable.push(candidate);
    else keyCooling.push(candidate);
  }
  for (const cred of input.credentials) {
    if (seen.has(cred.ref)) continue;
    keyUsable.push({ kind: "key", ref: cred.ref, value: cred.value });
  }
  return [...cliUsable, ...keyUsable, ...cliCooling, ...keyCooling];
}

export function seedDefaultCursorCliAccount(
  accounts: CursorCliAccount[] | undefined,
  migrated: boolean,
): CursorCliAccount[] {
  if (accounts?.length) return accounts.map((row) => ({ ...emptyCursorCliAccount(row.id, row.label), ...row }));
  if (!migrated) return [];
  return [emptyCursorCliAccount(DEFAULT_CURSOR_CLI_ACCOUNT_ID, "Default")];
}

export interface CursorCliLoginState {
  accountId: string;
  startedAt: number;
  loginUrl?: string;
}

export type CursorCliLoginSpawn = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => ChildProcess;

const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export function spawnCursorLoginAcp(command: string, env: NodeJS.ProcessEnv): ChildProcess {
  const proc = spawn(command, ["--trust", "acp"], { env, stdio: ["pipe", "pipe", "pipe"] });
  let nextId = 1;
  const send = (method: string, params: Record<string, unknown>) => {
    proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: nextId, method, params })}\n`);
    nextId += 1;
  };
  if (proc.stdout) {
    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown };
        if (msg.id === 1 && msg.result) send("authenticate", { methodId: "cursor_login" });
      } catch {
        // CLI may print the login URL as plain text on stderr instead.
      }
    });
  }
  send("initialize", { protocolVersion: 1, clientInfo: { name: "atelier", version: "0" } });
  return proc;
}

export class CursorCliLoginLock {
  private current: {
    accountId: string;
    startedAt: number;
    loginUrl?: string;
    proc: ChildProcess;
    output: string;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private readonly spawnFn: CursorCliLoginSpawn = (command, args, env) =>
    spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] }),
  ) {}

  get state(): CursorCliLoginState | null {
    if (!this.current) return null;
    return {
      accountId: this.current.accountId,
      startedAt: this.current.startedAt,
      loginUrl: this.current.loginUrl,
    };
  }

  start(input: {
    accountId: string;
    command: string;
    env?: NodeJS.ProcessEnv;
    fallback?: () => ChildProcess;
  }): CursorCliLoginState {
    if (this.current && this.current.accountId !== input.accountId) {
      throw new Error("Another Cursor CLI account is already signing in");
    }
    if (this.current && this.current.accountId === input.accountId) return this.state!;
    const home = ensureCursorAccountHome(input.accountId, input.env);
    const env = cursorAgentEnv(input.env ?? process.env, { home, apiKey: false });
    delete env.NO_OPEN_BROWSER;
    const proc = this.spawnFn(input.command, ["login"], env);
    const startedAt = Date.now();
    const session = {
      accountId: input.accountId,
      startedAt,
      loginUrl: undefined as string | undefined,
      proc,
      output: "",
      timer: setTimeout(() => this.stop(), LOGIN_TIMEOUT_MS),
    };
    this.current = session;
    const onChunk = (chunk: Buffer | string) => {
      session.output += String(chunk);
      const url = extractCursorLoginUrl(session.output);
      if (url) session.loginUrl = url;
    };
    proc.stdout?.on("data", onChunk);
    proc.stderr?.on("data", onChunk);
    proc.on("exit", (code) => {
      if (code && code !== 0 && /unknown command|usage:/i.test(session.output) && input.fallback) {
        this.replaceProcess(input.fallback());
        return;
      }
      this.clearTimer();
      if (this.current?.proc === proc) this.current = null;
    });
    proc.on("error", () => {
      this.stop();
    });
    return this.state!;
  }

  stop(): void {
    const session = this.current;
    if (!session) return;
    this.clearTimer();
    session.proc.kill("SIGTERM");
    this.current = null;
  }

  private replaceProcess(proc: ChildProcess): void {
    if (!this.current) return;
    this.current.proc = proc;
    const session = this.current;
    const onChunk = (chunk: Buffer | string) => {
      session.output += String(chunk);
      const url = extractCursorLoginUrl(session.output);
      if (url) session.loginUrl = url;
    };
    proc.stdout?.on("data", onChunk);
    proc.stderr?.on("data", onChunk);
    proc.on("exit", () => {
      this.clearTimer();
      if (this.current?.proc === proc) this.current = null;
    });
  }

  private clearTimer(): void {
    if (!this.current) return;
    clearTimeout(this.current.timer);
  }
}
