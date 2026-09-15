import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, existsSync, cpSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { previewServerScript, repoRoot } from "../paths.js";
import { isolationEnv, PREVIEW_SIDE_EFFECTS } from "./spec.js";

const execFileAsync = promisify(execFile);

export interface RuntimeHandle {
  workspaceId: string;
  worktree: string;
  port: number;
  previewUrl: string;
  stop: () => Promise<void>;
  exec: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
}

export interface WorkspaceRuntime {
  provision(input: {
    workspaceId: string;
    branch: string;
    sourceDir: string;
    user: { name: string; email: string };
  }): Promise<{ worktree: string }>;
  start(input: { workspaceId: string; worktree: string; hmr?: boolean }): Promise<RuntimeHandle>;
  hibernate(workspaceId: string): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  previewUrl(workspaceId: string): string | undefined;
}

const handles = new Map<string, RuntimeHandle>();
let nextPort = 45400;

function gitEnv(user: { name: string; email: string }): string[] {
  return [
    "-c",
    `user.name=${user.name}`,
    "-c",
    `user.email=${user.email}`,
    "-c",
    "commit.gpgsign=false",
  ];
}

async function git(cwd: string, user: { name: string; email: string }, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...gitEnv(user), ...args], { cwd });
  return stdout.trim();
}

export class ProcessRuntime implements WorkspaceRuntime {
  constructor(private readonly root = join(repoRoot(), "var", "workspaces")) {
    mkdirSync(this.root, { recursive: true });
  }

  async provision(input: {
    workspaceId: string;
    branch: string;
    sourceDir: string;
    user: { name: string; email: string };
  }): Promise<{ worktree: string }> {
    const worktree = join(this.root, input.workspaceId);
    if (existsSync(worktree)) return { worktree };
    mkdirSync(worktree, { recursive: true });
    const vendorSrc = join(input.sourceDir, "vendor");
    const modulesSrc = join(input.sourceDir, "node_modules");
    cpSync(input.sourceDir, worktree, {
      recursive: true,
      dereference: false,
      filter: (src) => !src.includes("/.git/") && !src.endsWith("/vendor") && !src.endsWith("/node_modules"),
    });
    if (existsSync(vendorSrc)) {
      try {
        await execFileAsync("cp", ["-al", vendorSrc, join(worktree, "vendor")]);
      } catch {
        cpSync(vendorSrc, join(worktree, "vendor"), { recursive: true });
      }
    }
    if (existsSync(modulesSrc)) {
      try {
        await execFileAsync("cp", ["-al", modulesSrc, join(worktree, "node_modules")]);
      } catch {
        cpSync(modulesSrc, join(worktree, "node_modules"), { recursive: true });
      }
    }
    if (!existsSync(join(worktree, ".git"))) {
      await git(worktree, input.user, ["init"]);
      await git(worktree, input.user, ["add", "-A"]);
      await git(worktree, input.user, ["commit", "-m", "chore: provision workspace", "--allow-empty"]);
      await git(worktree, input.user, ["checkout", "-B", input.branch]);
    }
    mkdirSync(join(worktree, ".cursor"), { recursive: true });
    writeFileSync(
      join(worktree, ".cursor/mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] },
            "preview-inspector": { command: "node", args: ["scripts/preview-inspector.mjs"] },
          },
        },
        null,
        2,
      ),
    );
    return { worktree };
  }

  async start(input: { workspaceId: string; worktree: string; hmr?: boolean }): Promise<RuntimeHandle> {
    const existing = handles.get(input.workspaceId);
    if (existing) return existing;
    const port = nextPort++;
    const previewUrl = `http://127.0.0.1:${port}`;
    const env = {
      ...process.env,
      ...PREVIEW_SIDE_EFFECTS,
      ...isolationEnv(input.workspaceId, previewUrl),
      PORT: String(port),
      WORKTREE: input.worktree,
    };
    const child = startPreviewServer(input.worktree, port, env);
    const handle: RuntimeHandle = {
      workspaceId: input.workspaceId,
      worktree: input.worktree,
      port,
      previewUrl,
      stop: async () => {
        child.kill();
        handles.delete(input.workspaceId);
      },
      exec: async (command, args) => {
        try {
          const { stdout, stderr } = await execFileAsync(command, args, {
            cwd: input.worktree,
            env,
          });
          return { stdout, stderr, code: 0 };
        } catch (error) {
          const err = error as { stdout?: string; stderr?: string; code?: number };
          return { stdout: err.stdout ?? "", stderr: err.stderr ?? String(error), code: err.code ?? 1 };
        }
      },
    };
    handles.set(input.workspaceId, handle);
    return handle;
  }

  async hibernate(workspaceId: string): Promise<void> {
    await handles.get(workspaceId)?.stop();
  }

  async destroy(workspaceId: string): Promise<void> {
    await this.hibernate(workspaceId);
    const dir = join(this.root, workspaceId);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  previewUrl(workspaceId: string): string | undefined {
    return handles.get(workspaceId)?.previewUrl;
  }
}

export class DockerRuntime extends ProcessRuntime {
  // Same contract as ProcessRuntime. Production image is infra/workspace-php85.Dockerfile.
}

function startPreviewServer(worktree: string, port: number, env: NodeJS.ProcessEnv): ChildProcess {
  const script = previewServerScript();
  if (existsSync(script)) {
    return spawn(process.execPath, [script], { env: { ...env, PORT: String(port), WORKTREE: worktree }, stdio: "pipe" });
  }
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<html><body><p>Preview unavailable for ${worktree}</p><p>${req.url}</p></body></html>`);
  });
  server.listen(port);
  const dummy = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1<<30)"], { stdio: "ignore" });
  dummy.on("exit", () => server.close());
  return dummy;
}

export function applyHunkToWorktree(worktree: string, filePath: string, contents: string): void {
  const target = join(worktree, filePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

export function readWorktreeFile(worktree: string, filePath: string): string | null {
  const target = join(worktree, filePath);
  if (!existsSync(target)) return null;
  return readFileSync(target, "utf8");
}
