import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export interface AcpPromptBlock {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

type Pending = { resolve: (value: unknown) => void; reject: (err: unknown) => void };

export class AcpSession {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  sessionId: string | null = null;
  readonly inbound: Array<Record<string, unknown>> = [];

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly onUpdate: (msg: Record<string, unknown>) => void,
    private readonly onPermission: (id: number, params: unknown) => void,
  ) {}

  start(env: NodeJS.ProcessEnv = process.env, cwd?: string): void {
    this.proc = spawn(this.command, this.args, { stdio: ["pipe", "pipe", "pipe"], env, cwd });
    this.proc.on("exit", (code) => {
      const err = new Error(`ACP process exited (${code ?? "null"})`);
      for (const waiter of this.pending.values()) waiter.reject(err);
      this.pending.clear();
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
      if (typeof msg.id === "number" && (msg.result || msg.error) && this.pending.has(msg.id)) {
        const waiter = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
        return;
      }
      if (msg.method === "session/update") {
        this.onUpdate(msg);
        return;
      }
      if (msg.method === "session/request_permission" && typeof msg.id === "number") {
        this.onPermission(msg.id, msg.params);
      }
    });
  }

  send(method: string, params: unknown): Promise<unknown> {
    if (!this.proc) throw new Error("ACP process is not running");
    const id = this.nextId++;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  respond(id: number, result: unknown): void {
    this.proc?.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  }

  async initialize(): Promise<unknown> {
    return this.send("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "atelier", version: "0.1.0" },
    });
  }

  async authenticate(): Promise<unknown> {
    return this.send("authenticate", { methodId: "cursor_login" });
  }

  async newSession(cwd: string, mcpServers: unknown[] = []): Promise<string> {
    const result = (await this.send("session/new", { cwd, mcpServers })) as { sessionId: string };
    this.sessionId = result.sessionId;
    return result.sessionId;
  }

  async loadSession(sessionId: string, cwd: string): Promise<void> {
    await this.send("session/load", { sessionId, cwd });
    this.sessionId = sessionId;
  }

  async prompt(blocks: AcpPromptBlock[]): Promise<unknown> {
    if (!this.sessionId) throw new Error("No ACP session");
    return this.send("session/prompt", { sessionId: this.sessionId, prompt: blocks });
  }

  async cancel(): Promise<void> {
    if (!this.sessionId) return;
    await this.send("session/cancel", { sessionId: this.sessionId }).catch(() => undefined);
  }

  stop(): void {
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = null;
  }
}
