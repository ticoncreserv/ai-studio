import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot } from "../paths.js";
import { isolationEnv, PREVIEW_SIDE_EFFECTS, defaultWorkspaceSpec } from "./spec.js";
import { allocatePort } from "./ports.js";
import { artisanOfflineEnv, mergeWorktreeEnv } from "./env-file.js";
import { mergeWorktreeMcp } from "../mcp/layers.js";
import { provisionWorktree, type CloneInput } from "./clone.js";
import { waitForHealth } from "./health.js";
import { publicViteOrigin, writeViteAtelierConfig, writeViteHotFile } from "./vite-preview.js";
import { ensureWayfinderFormMethods } from "./wayfinder-forms.js";
import { appendPreviewLog, readPreviewLogs, writePreviewLogs } from "./preview-logs.js";

const execFileAsync = promisify(execFile);

export interface RuntimeHandle {
  workspaceId: string;
  worktree: string;
  port: number;
  vitePort?: number;
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
  userId?: string;
  envRoot?: string;
}

export interface StartRequest {
  workspaceId: string;
  worktree: string;
  publicUrl: string;
  hmr?: boolean;
  userId?: string;
  envRoot?: string;
}

export interface WorkspaceRuntime {
  provision(input: ProvisionRequest): Promise<{ worktree: string }>;
  start(input: StartRequest): Promise<RuntimeHandle>;
  hibernate(workspaceId: string, ports?: { port?: number; vitePort?: number }): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  previewUrl(workspaceId: string): string | undefined;
  isRunning(workspaceId: string): boolean;
  readLogs?(workspaceId: string): { artisan: string; vite: string };
}

type GlobalRuntime = typeof globalThis & { __atelierRuntimeHandles?: Map<string, RuntimeHandle> };
const handles = ((globalThis as GlobalRuntime).__atelierRuntimeHandles ??= new Map());

function childPids(pid: number): number[] {
  try {
    const raw = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
    const pids = raw.split(/\s+/).map(Number).filter(Boolean);
    return pids.flatMap((child) => [child, ...childPids(child)]);
  } catch {
    return [];
  }
}

function killPid(pid: number, signal: NodeJS.Signals) {
  if (pid === process.pid) return;
  try {
    process.kill(pid, signal);
  } catch {
    /* already gone */
  }
}

function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (!child.pid) return;
  for (const pid of childPids(child.pid)) killPid(pid, signal);
  try {
    if (child.pid !== process.pid) child.kill(signal);
  } catch {
    /* already gone */
  }
}

async function pidsOnPort(port: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-ti", `:${port}`]);
    return stdout.split(/\s+/).map(Number).filter((pid) => pid && pid !== process.pid);
  } catch {
    try {
      const { stdout } = await execFileAsync("fuser", [`${port}/tcp`]);
      return stdout.split(/\s+/).map(Number).filter((pid) => pid && pid !== process.pid);
    } catch {
      return [];
    }
  }
}

async function killPort(port: number): Promise<void> {
  const pids = await pidsOnPort(port);
  for (const pid of pids) killPid(pid, "SIGTERM");
  if (!pids.length) return;
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const pid of await pidsOnPort(port)) killPid(pid, "SIGKILL");
}

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

function commandExists(command: string): boolean {
  const path = process.env.PATH ?? "";
  return path.split(":").some((dir) => existsSync(join(dir, command)));
}

function assertPreviewToolchain(worktree: string): void {
  if (!commandExists("php")) {
    throw new Error(
      "PHP 8.5 is not installed. Install php8.5-cli plus mbstring, xml, curl, zip, gd, intl, bcmath, and mysql. The cloned app requires php ^8.5.",
    );
  }
  if (existsSync(join(worktree, "composer.json")) && !existsSync(join(worktree, "vendor"))) {
    if (!commandExists("composer")) {
      throw new Error("Composer is not installed and vendor/ is missing. Install Composer and run composer install in the worktree.");
    }
    throw new Error("vendor/ is missing. Run composer install in the workspace worktree.");
  }
}

async function installDependencies(worktree: string): Promise<void> {
  if (existsSync(join(worktree, "composer.json")) && !existsSync(join(worktree, "vendor"))) {
    if (!commandExists("php") || !commandExists("composer")) {
      // Fixture worktrees ship composer.json without vendor/. Skip the install in tests when PHP is absent.
      if (!process.env.VITEST) {
        throw new Error("PHP 8.5 and Composer are required to install Laravel vendor/ for preview.");
      }
    } else {
      await execFileAsync("composer", ["install", "--no-interaction", "--prefer-dist"], {
        cwd: worktree,
        timeout: 300_000,
      });
    }
  }
  if (existsSync(join(worktree, "package.json")) && !existsSync(join(worktree, "node_modules"))) {
    await execFileAsync("npm", ["install"], { cwd: worktree, timeout: 180_000 });
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
    mergeWorktreeMcp({
      worktree,
      storeDir: input.envRoot ? dirname(input.envRoot) : join(repoRoot(), "var"),
      userId: input.userId,
    });
    mergeWorktreeEnv(
      worktree,
      {
        ...PREVIEW_SIDE_EFFECTS,
        ...isolationEnv(input.workspaceId, "http://127.0.0.1"),
      },
      { userId: input.userId, envRoot: input.envRoot },
    );
    await installDependencies(worktree);
    return { worktree };
  }

  async start(input: StartRequest): Promise<RuntimeHandle> {
    const spec = defaultWorkspaceSpec();
    const viteOrigin = publicViteOrigin(input.publicUrl);
    const existing = handles.get(input.workspaceId);
    if (existing) {
      const artisanUp = await waitForHealth(`http://127.0.0.1:${existing.port}${spec.healthCheck.path}`, 2_500);
      const viteUp = existing.vitePort
        ? await waitForHealth(`http://127.0.0.1:${existing.vitePort}/@vite/client`, 2_500)
        : false;
      if (artisanUp && (!existsSync(join(input.worktree, "package.json")) || viteUp)) {
        if (existing.vitePort) writeViteHotFile(input.worktree, viteOrigin);
        return existing;
      }
      await existing.stop();
    }
    assertPreviewToolchain(input.worktree);
    if (existsSync(join(input.worktree, "package.json")) && !existsSync(join(input.worktree, "node_modules"))) {
      await installDependencies(input.worktree);
    }
    const port = await allocatePort();
    const wantsVite = existsSync(join(input.worktree, "package.json"));
    const vitePort = wantsVite ? await allocatePort(port + 1) : undefined;
    const env = mergeWorktreeEnv(
      input.worktree,
      {
        ...PREVIEW_SIDE_EFFECTS,
        ...isolationEnv(input.workspaceId, input.publicUrl),
        APP_URL: input.publicUrl,
        PORT: String(port),
      },
      { userId: input.userId, envRoot: input.envRoot },
    );
    const childEnv = { ...process.env, ...env, PORT: String(port), APP_URL: input.publicUrl };
    const children: ChildProcess[] = [];
    const artisan = join(input.worktree, "artisan");
    let artisanLog = "";
    let viteLog = "";
    const pushArtisan = (chunk: string) => {
      artisanLog += chunk;
      if (artisanLog.length > 64_000) artisanLog = artisanLog.slice(-64_000);
      appendPreviewLog(input.workspaceId, "artisan", chunk);
    };
    const pushVite = (chunk: string) => {
      viteLog += chunk;
      if (viteLog.length > 64_000) viteLog = viteLog.slice(-64_000);
      appendPreviewLog(input.workspaceId, "vite", chunk);
    };
    if (existsSync(artisan)) {
      const php = spawn("php", ["artisan", "serve", "--host", "127.0.0.1", "--port", String(port)], {
        cwd: input.worktree,
        env: childEnv,
        stdio: "pipe",
      });
      php.stderr?.on("data", (chunk) => pushArtisan(String(chunk)));
      php.stdout?.on("data", (chunk) => pushArtisan(String(chunk)));
      php.on("error", (error) => pushArtisan(error.message));
      children.push(php);
    } else {
      throw new Error("This workspace is not a Laravel app (artisan missing). Reprovision from ticoncreserv/app.");
    }
    if (wantsVite && vitePort) {
      const viteBin = join(input.worktree, "node_modules", ".bin", "vite");
      if (!existsSync(viteBin)) {
        throw new Error("Vite is not installed in the worktree. Run npm install so preview can compile assets in dev mode.");
      }
      const config = writeViteAtelierConfig(input.worktree);
      const viteEnv = {
        ...childEnv,
        PORT: String(vitePort),
        ATELIER_VITE_PORT: String(vitePort),
      };
      const vite = spawn(viteBin, ["--config", config, "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"], {
        cwd: input.worktree,
        env: viteEnv,
        stdio: "pipe",
      });
      vite.stderr?.on("data", (chunk) => pushVite(String(chunk)));
      vite.stdout?.on("data", (chunk) => pushVite(String(chunk)));
      vite.on("error", (error) => pushVite(error.message));
      children.push(vite);
      if (existsSync(join(input.worktree, "package.json"))) {
        children.push(
          spawn("php", ["artisan", "wayfinder:generate", "--with-form", "--no-interaction"], {
            cwd: input.worktree,
            env: artisanOfflineEnv(childEnv, input.worktree),
            stdio: "ignore",
          }),
        );
        ensureWayfinderFormMethods(input.worktree);
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
      vitePort,
      previewUrl: `http://127.0.0.1:${port}`,
      stop: async () => {
        for (const child of children) killTree(child, "SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 150));
        for (const child of children) killTree(child, "SIGKILL");
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
      const detail = artisanLog.trim().slice(-400);
      const message = `Preview did not become healthy on /up for workspace ${input.workspaceId}${detail ? `: ${detail}` : ". Check that PHP 8.5 can boot artisan serve."}`;
      writePreviewLogs(input.workspaceId, { artisan: artisanLog, vite: viteLog, error: message });
      throw new Error(message);
    }
    if (vitePort) {
      const viteReady = await waitForHealth(`http://127.0.0.1:${vitePort}/@vite/client`, 30_000);
      if (!viteReady) {
        await handle.stop();
        const detail = viteLog.trim().slice(-400);
        const message = `Vite did not start in dev mode for workspace ${input.workspaceId}${detail ? `: ${detail}` : ". Check node_modules/.bin/vite and that PORT is not shared with artisan."}`;
        writePreviewLogs(input.workspaceId, { artisan: artisanLog, vite: viteLog, error: message });
        throw new Error(message);
      }
      writeViteHotFile(input.worktree, viteOrigin);
    }
    writePreviewLogs(input.workspaceId, { artisan: artisanLog, vite: viteLog });
    return handle;
  }

  async hibernate(workspaceId: string, ports?: { port?: number; vitePort?: number }): Promise<void> {
    const handle = handles.get(workspaceId);
    const port = handle?.port ?? ports?.port;
    const vitePort = handle?.vitePort ?? ports?.vitePort;
    await handle?.stop();
    handles.delete(workspaceId);
    if (port) await killPort(port);
    if (vitePort) await killPort(vitePort);
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

  readLogs(workspaceId: string): { artisan: string; vite: string } {
    const logs = readPreviewLogs(workspaceId);
    return { artisan: logs.artisan, vite: logs.vite };
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
