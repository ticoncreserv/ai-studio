import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot } from "../paths.js";
import { isolationEnv, PREVIEW_SIDE_EFFECTS, defaultWorkspaceSpec } from "./spec.js";
import { allocatePort } from "./ports.js";
import { mergeWorktreeEnv } from "./env-file.js";
import { provisionWorktree, type CloneInput } from "./clone.js";
import { waitForHealth } from "./health.js";

const execFileAsync = promisify(execFile);

export interface RuntimeHandle {
  workspaceId: string;
  worktree: string;
  port: number;
  previewUrl: string;
  stop: () => Promise<void>;
  exec: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
}

export interface ProvisionRequest {
  workspaceId: string;
  branch: string;
  user: { name: string; email: string };
  sourceDir?: string;
  repo?: string;
  token?: string;
  force?: boolean;
}

export interface StartRequest {
  workspaceId: string;
  worktree: string;
  publicUrl: string;
  hmr?: boolean;
}

export interface WorkspaceRuntime {
  provision(input: ProvisionRequest): Promise<{ worktree: string }>;
  start(input: StartRequest): Promise<RuntimeHandle>;
  hibernate(workspaceId: string): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  previewUrl(workspaceId: string): string | undefined;
  isRunning(workspaceId: string): boolean;
}

const handles = new Map<string, RuntimeHandle>();

function writeGitignore(worktree: string): void {
  const file = join(worktree, ".gitignore");
  const extra = ["", ".env", ".cursor/", "var/uploads/", ""].join("\n");
  if (!existsSync(file)) {
    writeFileSync(file, extra.trimStart());
    return;
  }
  const current = readFileSync(file, "utf8");
  const missing = [".env", ".cursor/", "var/uploads/"].filter((line) => !current.split("\n").includes(line));
  if (missing.length) writeFileSync(file, `${current.trimEnd()}\n${missing.join("\n")}\n`);
}

function writeMcpConfig(worktree: string): void {
  mkdirSync(join(worktree, ".cursor"), { recursive: true });
  writeFileSync(
    join(worktree, ".cursor/mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          "laravel-boost": { command: "php", args: ["artisan", "boost:mcp"] },
        },
      },
      null,
      2,
    ),
  );
}

async function installDependencies(worktree: string): Promise<void> {
  if (existsSync(join(worktree, "composer.json")) && !existsSync(join(worktree, "vendor"))) {
    await execFileAsync("composer", ["install", "--no-interaction", "--prefer-dist"], {
      cwd: worktree,
      timeout: 180_000,
    }).catch(() => undefined);
  }
  if (existsSync(join(worktree, "package.json")) && !existsSync(join(worktree, "node_modules"))) {
    await execFileAsync("npm", ["install"], { cwd: worktree, timeout: 180_000 }).catch(() => undefined);
  }
  if (existsSync(join(worktree, "package.json")) && !existsSync(join(worktree, "public", "build"))) {
    await execFileAsync("npm", ["run", "build"], { cwd: worktree, timeout: 180_000 }).catch(() => undefined);
  }
}

export class ProcessRuntime implements WorkspaceRuntime {
  constructor(private readonly root = process.env.ATELIER_WORKTREE_ROOT || join(repoRoot(), "var", "workspaces")) {
    mkdirSync(this.root, { recursive: true });
  }

  async provision(input: ProvisionRequest): Promise<{ worktree: string }> {
    const worktree = join(this.root, input.workspaceId);
    const clone: CloneInput = {
      worktree,
      branch: input.branch,
      user: input.user,
      sourceDir: input.sourceDir,
      repo: input.repo,
      token: input.token,
      force: input.force,
    };
    await provisionWorktree(clone);
    writeGitignore(worktree);
    writeMcpConfig(worktree);
    mergeWorktreeEnv(worktree, {
      ...PREVIEW_SIDE_EFFECTS,
      ...isolationEnv(input.workspaceId, "http://127.0.0.1"),
    });
    await installDependencies(worktree);
    return { worktree };
  }

  async start(input: StartRequest): Promise<RuntimeHandle> {
    const existing = handles.get(input.workspaceId);
    if (existing) return existing;
    const port = await allocatePort();
    const env = mergeWorktreeEnv(input.worktree, {
      ...PREVIEW_SIDE_EFFECTS,
      ...isolationEnv(input.workspaceId, input.publicUrl),
      APP_URL: input.publicUrl,
      PORT: String(port),
    });
    const childEnv = { ...process.env, ...env, PORT: String(port), APP_URL: input.publicUrl };
    const children: ChildProcess[] = [];
    const artisan = join(input.worktree, "artisan");
    if (existsSync(artisan)) {
      children.push(
        spawn("php", ["artisan", "serve", "--host", "127.0.0.1", "--port", String(port)], {
          cwd: input.worktree,
          env: childEnv,
          stdio: "pipe",
        }),
      );
    } else {
      throw new Error("This workspace is not a Laravel app (artisan missing). Reprovision from ticoncreserv/app.");
    }
    const spec = defaultWorkspaceSpec();
    if (input.hmr && existsSync(join(input.worktree, "package.json"))) {
      const vite = spec.processes.find((p) => p.name === "vite");
      if (vite) {
        children.push(spawn(vite.command, vite.args, { cwd: input.worktree, env: childEnv, stdio: "pipe" }));
      }
    }
    if (process.env.ATELIER_PREVIEW_QUEUE === "1") {
      const queue = spec.processes.find((p) => p.name === "queue");
      if (queue) {
        children.push(spawn(queue.command, queue.args, { cwd: input.worktree, env: childEnv, stdio: "pipe" }));
      }
    }
    const handle: RuntimeHandle = {
      workspaceId: input.workspaceId,
      worktree: input.worktree,
      port,
      previewUrl: `http://127.0.0.1:${port}`,
      stop: async () => {
        for (const child of children) child.kill();
        handles.delete(input.workspaceId);
      },
      exec: async (command, args) => {
        try {
          const { stdout, stderr } = await execFileAsync(command, args, { cwd: input.worktree, env: childEnv });
          return { stdout, stderr, code: 0 };
        } catch (error) {
          const err = error as { stdout?: string; stderr?: string; code?: number };
          return { stdout: err.stdout ?? "", stderr: err.stderr ?? String(error), code: err.code ?? 1 };
        }
      },
    };
    handles.set(input.workspaceId, handle);
    const healthy = await waitForHealth(`http://127.0.0.1:${port}${spec.healthCheck.path}`, spec.healthCheck.timeoutMs);
    if (!healthy) {
      await handle.stop();
      throw new Error(`Preview did not become healthy on /up for workspace ${input.workspaceId}`);
    }
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

  isRunning(workspaceId: string): boolean {
    return handles.has(workspaceId);
  }
}

export class DockerRuntime extends ProcessRuntime {
  override async start(input: StartRequest): Promise<RuntimeHandle> {
    try {
      await execFileAsync("docker", ["info"], { timeout: 5000 });
    } catch {
      throw new Error("ATELIER_RUNTIME=docker but docker is not available on this host");
    }
    return super.start(input);
  }
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
