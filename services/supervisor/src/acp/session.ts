import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { toAgentError } from "./errors.js";

export interface AcpPromptBlock {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

type Pending = { resolve: (value: unknown) => void; reject: (err: unknown) => void; timer?: ReturnType<typeof setTimeout> };

export interface AcpAuthMethod {
  id: string;
  name?: string;
}

export interface AcpAgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean };
  mcpCapabilities?: { http?: boolean; sse?: boolean };
}

export interface AcpInitializeResult {
  protocolVersion?: number;
  agentCapabilities?: AcpAgentCapabilities;
  authMethods?: AcpAuthMethod[];
  agentInfo?: { name?: string; version?: string };
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function selectAuthMethod(
  methods: AcpAuthMethod[] | undefined,
  preferred?: string[],
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const ids = (methods ?? []).map((method) => method.id);
  if (!ids.length) return undefined;
  for (const id of preferred ?? []) {
    if (ids.includes(id)) return id;
  }
  if (env.ANTHROPIC_API_KEY && ids.includes("anthropic_api_key")) return "anthropic_api_key";
  if ((env.GEMINI_API_KEY || env.GOOGLE_API_KEY) && ids.includes("gemini_api_key")) return "gemini_api_key";
  if (env.XAI_API_KEY && ids.includes("xai.api_key")) return "xai.api_key";
  if (env.CURSOR_API_KEY && ids.includes("cursor_login")) return "cursor_login";
  if (ids.includes("cached_token")) return "cached_token";
  return ids[0];
}

export class AcpSession {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private stderr = "";
  sessionId: string | null = null;
  capabilities: AcpAgentCapabilities | null = null;
  authMethods: AcpAuthMethod[] = [];
  initializeResult: AcpInitializeResult | null = null;
  readonly inbound: Array<Record<string, unknown>> = [];

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly onUpdate: (msg: Record<string, unknown>) => void,
    private readonly onPermission: (id: number, params: unknown) => void,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  start(env: NodeJS.ProcessEnv = process.env, cwd?: string): void {
    this.proc = spawn(this.command, this.args, { stdio: ["pipe", "pipe", "pipe"], env, cwd });
    this.proc.on("error", (error) => {
      this.rejectAll(new Error(`ACP process failed to start: ${error.message}`));
    });
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += String(chunk);
      if (this.stderr.length > 8000) this.stderr = this.stderr.slice(-8000);
    });
    this.proc.on("exit", (code) => {
      const tail = this.stderr.trim();
      const detail = tail ? `: ${tail.slice(-400)}` : "";
      this.rejectAll(new Error(`ACP process exited (${code ?? "null"})${detail}`));
    });
    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }
      this.inbound.push(msg);
      if (typeof msg.id === "number" && this.pending.has(msg.id) && ("error" in msg || "result" in msg)) {
        const waiter = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (waiter.timer) clearTimeout(waiter.timer);
        msg.error ? waiter.reject(toAgentError(msg.error)) : waiter.resolve(msg.result);
        return;
      }
      if (msg.method === "session/update") {
        this.onUpdate(msg);
        return;
      }
      if (msg.method === "session/request_permission" && typeof msg.id === "number") {
        this.onPermission(msg.id, msg.params);
        return;
      }
      if (typeof msg.method === "string" && typeof msg.id === "number") {
        this.respond(msg.id, undefined, { code: -32601, message: `Method not supported: ${msg.method}` });
      }
    });
  }

  send(method: string, params: unknown, timeoutMs = this.timeoutMs): Promise<unknown> {
    if (!this.proc) throw new Error("ACP process is not running");
    const id = this.nextId++;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`ACP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method: string, params: unknown): void {
    if (!this.proc) throw new Error("ACP process is not running");
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  respond(id: number, result: unknown, error?: { code: number; message: string }): void {
    if (error) {
      this.proc?.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n");
      return;
    }
    this.proc?.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  }

  async initialize(): Promise<AcpInitializeResult> {
    const result = (await this.send("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "atelier", version: "0.1.0" },
    })) as AcpInitializeResult;
    this.initializeResult = result ?? {};
    this.capabilities = result?.agentCapabilities ?? {};
    this.authMethods = result?.authMethods ?? [];
    return this.initializeResult;
  }

  async authenticate(methodId?: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    const selected = methodId ?? selectAuthMethod(this.authMethods);
    if (!selected) return undefined;
    return this.send("authenticate", { methodId: selected, ...extra });
  }

  async newSession(cwd: string, mcpServers: unknown[] = []): Promise<string> {
    const result = (await this.send("session/new", { cwd, mcpServers })) as { sessionId?: string };
    if (!result?.sessionId) throw new Error("ACP session/new did not return a sessionId");
    this.sessionId = result.sessionId;
    return result.sessionId;
  }

  async loadSession(sessionId: string, cwd: string, mcpServers: unknown[] = []): Promise<void> {
    if (this.capabilities?.loadSession === false) {
      throw new Error("Agent does not advertise session load");
    }
    await this.send("session/load", { sessionId, cwd, mcpServers });
    this.sessionId = sessionId;
  }

  async prompt(blocks: AcpPromptBlock[]): Promise<unknown> {
    if (!this.sessionId) throw new Error("No ACP session");
    return this.send("session/prompt", { sessionId: this.sessionId, prompt: blocks }, Math.max(this.timeoutMs, 120_000));
  }

  async cancel(): Promise<void> {
    if (!this.sessionId) return;
    this.notify("session/cancel", { sessionId: this.sessionId });
  }

  stop(): void {
    this.rejectAll(new Error("ACP session stopped"));
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = null;
  }

  private rejectAll(error: Error): void {
    for (const waiter of this.pending.values()) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }
}
