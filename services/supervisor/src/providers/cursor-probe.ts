import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderModel } from "@atelier/contracts";
import { isCursorCliLoggedOut, isProviderKeyFailure } from "@atelier/domain";
import type { ProviderCredential } from "./credentials.js";
import { cursorAgentEnv, cursorProbeHome } from "./env.js";

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 20_000;

export interface CursorProbeExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type CursorProbeRun = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<CursorProbeExecResult>;

export interface CursorKeyProbeResult {
  ref: string;
  ok: boolean;
  /** `cli_login` is a CLI session problem, not a bad API key. */
  kind?: "key" | "cli_login";
  message?: string;
}

export interface CursorCliProbeResult {
  id: string;
  loggedIn: boolean;
  account?: string;
  message?: string;
}

export interface CursorApiKeyProbe {
  keys: CursorKeyProbeResult[];
  models: ProviderModel[];
}

function clipProbeOutput(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 400);
}

export function interpretCursorCliStatus(
  stdout: string,
  stderr: string,
  exitCode: number,
): { loggedIn: boolean; account?: string; message?: string } {
  const text = `${stdout}\n${stderr}`;
  const account = text.match(/logged in as\s+(\S+)/i)?.[1];
  if (/logged in/i.test(text) && !isCursorCliLoggedOut(text) && exitCode === 0) {
    return { loggedIn: true, account };
  }
  if (isCursorCliLoggedOut(text) || exitCode !== 0) {
    return { loggedIn: false, message: clipProbeOutput(text) || "Cursor CLI is not authenticated" };
  }
  return { loggedIn: true, account };
}

/** @deprecated Use interpretCursorCliStatus. Kept for existing tests that imported the old name. */
export function interpretCursorStatus(stdout: string, stderr: string, exitCode: number): { ok: boolean; message?: string } {
  const parsed = interpretCursorCliStatus(stdout, stderr, exitCode);
  return parsed.loggedIn ? { ok: true } : { ok: false, message: parsed.message };
}

export function interpretCursorApiKeyProbe(
  stdout: string,
  stderr: string,
  exitCode: number,
): { ok: boolean; kind?: "key" | "cli_login"; message?: string } {
  const text = `${stdout}\n${stderr}`;
  const models = parseCursorModelList(text);
  if (models.length) return { ok: true };
  if (isProviderKeyFailure(text)) {
    return { ok: false, kind: "key", message: clipProbeOutput(text) || "Cursor API key probe failed" };
  }
  if (exitCode === 0) return { ok: true };
  return {
    ok: false,
    kind: "cli_login",
    message: clipProbeOutput(text) || `agent --list-models exited ${exitCode}`,
  };
}

/** Parse `agent --list-models` / `agent models` lines like `composer-2.5 - Composer 2.5`. */
export function parseCursorModelList(text: string): ProviderModel[] {
  const out: ProviderModel[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^available models/i.test(line)) continue;
    const match = line.match(/^([a-z0-9][a-z0-9._-]*)\s+-\s+(.+)$/i);
    if (!match) continue;
    const id = match[1]!;
    const label = match[2]!.replace(/\s*\(default\)\s*$/i, "").trim() || id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

export async function defaultCursorProbeRun(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<CursorProbeExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      env,
      timeout: PROBE_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return { status: 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
  } catch (error) {
    const err = error as {
      status?: number;
      code?: string | number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const status = typeof err.status === "number" ? err.status : typeof err.code === "number" ? err.code : 1;
    return {
      status,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? err.message ?? ""),
    };
  }
}

function looksLikeUnknownCommand(stdout: string, stderr: string): boolean {
  return /unknown command|usage:/i.test(`${stdout}\n${stderr}`);
}

export async function probeCursorApiKeys(input: {
  command: string;
  credentials: ProviderCredential[];
  env?: NodeJS.ProcessEnv;
  run?: CursorProbeRun;
}): Promise<CursorApiKeyProbe> {
  const run = input.run ?? defaultCursorProbeRun;
  const keys: CursorKeyProbeResult[] = [];
  let models: ProviderModel[] = [];
  for (const cred of input.credentials) {
    const env = {
      ...cursorAgentEnv(input.env ?? process.env, { home: cursorProbeHome(input.env), apiKey: cred.value }),
      NO_OPEN_BROWSER: "1",
    };
    let listed = await run(input.command, ["--api-key", cred.value, "--list-models"], env);
    if (looksLikeUnknownCommand(listed.stdout, listed.stderr)) {
      listed = await run(input.command, ["--api-key", cred.value, "models"], env);
    }
    const interpreted = interpretCursorApiKeyProbe(listed.stdout, listed.stderr, listed.status);
    if (interpreted.ok && !models.length) {
      models = parseCursorModelList(`${listed.stdout}\n${listed.stderr}`);
    }
    keys.push({
      ref: cred.ref,
      ok: interpreted.ok,
      kind: interpreted.ok ? undefined : interpreted.kind,
      message: interpreted.ok ? undefined : interpreted.message,
    });
  }
  return { keys, models };
}

export async function probeCursorCliAccounts(input: {
  command: string;
  accounts: Array<{ id: string; home: string }>;
  env?: NodeJS.ProcessEnv;
  run?: CursorProbeRun;
}): Promise<CursorCliProbeResult[]> {
  const run = input.run ?? defaultCursorProbeRun;
  const out: CursorCliProbeResult[] = [];
  for (const account of input.accounts) {
    const env = {
      ...cursorAgentEnv(input.env ?? process.env, { home: account.home, apiKey: false }),
      NO_OPEN_BROWSER: "1",
    };
    const status = await run(input.command, ["status"], env);
    const interpreted = interpretCursorCliStatus(status.stdout, status.stderr, status.status);
    out.push({
      id: account.id,
      loggedIn: interpreted.loggedIn,
      account: interpreted.account,
      message: interpreted.message,
    });
  }
  return out;
}
