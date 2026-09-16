import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Hunk } from "@atelier/contracts";
import { repoRoot } from "../paths.js";
import { isolationEnv, PREVIEW_SIDE_EFFECTS, defaultWorkspaceSpec } from "./spec.js";
import { allocatePort } from "./ports.js";
import { artisanOfflineEnv, mergeWorktreeEnv } from "./env-file.js";
import { mergeWorktreeMcp } from "../mcp/layers.js";
import { provisionWorktree, type CloneInput } from "./clone.js";
import { waitForPort } from "./health.js";
import { hydrateDependencySnapshots, persistDependencySnapshots } from "./deps-cache.js";
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
  if (!process.env.VITEST) hydrateDependencySnapshots(worktree);
  const jobs: Promise<unknown>[] = [];
  if (existsSync(join(worktree, "composer.json")) && !existsSync(join(worktree, "vendor"))) {
    if (!commandExists("php") || !commandExists("composer")) {
      // Fixture worktrees ship composer.json without vendor/. Skip the install in tests when PHP is absent.
      if (!process.env.VITEST) {
        throw new Error("PHP 8.5 and Composer are required to install Laravel vendor/ for preview.");
      }
    } else {
      jobs.push(
        execFileAsync("composer", ["install", "--no-interaction", "--prefer-dist"], {
          cwd: worktree,
          timeout: 300_000,
        }),
      );
    }
  }
  if (existsSync(join(worktree, "package.json")) && !existsSync(join(worktree, "node_modules"))) {
    const npmArgs = existsSync(join(worktree, "package-lock.json"))
      ? ["ci", "--no-audit", "--no-fund"]
      : ["install", "--no-audit", "--no-fund"];
    jobs.push(execFileAsync("npm", npmArgs, { cwd: worktree, timeout: 180_000 }));
  }
  if (jobs.length) await Promise.all(jobs);
  if (!process.env.VITEST) persistDependencySnapshots(worktree);
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
      const artisanUp = await waitForPort(existing.port, 2_500);
      const viteUp = existing.vitePort ? await waitForPort(existing.vitePort, 2_500) : false;
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
    // Homologation /up can hang on 10.x DBs. Open only waits until artisan accepts TCP.
    const listening = await waitForPort(port, Math.min(spec.healthCheck.timeoutMs, 8_000));
    if (!listening) {
      await handle.stop();
      const detail = artisanLog.trim().slice(-400);
      const message = `Preview artisan did not listen on port ${port} for workspace ${input.workspaceId}${detail ? `: ${detail}` : ". Check that PHP 8.5 can boot artisan serve."}`;
      writePreviewLogs(input.workspaceId, { artisan: artisanLog, vite: viteLog, error: message });
      throw new Error(message);
    }
    if (vitePort) {
      const viteReady = await waitForPort(vitePort, 15_000);
      if (!viteReady) {
        await handle.stop();
        const detail = viteLog.trim().slice(-400);
        const message = `Vite did not listen on port ${vitePort} for workspace ${input.workspaceId}${detail ? `: ${detail}` : ". Check node_modules/.bin/vite and that PORT is not shared with artisan."}`;
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

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function resolveWorktreePath(worktree: string, filePath: string): string {
  if (!filePath || isAbsolute(filePath)) throw new Error("File path must be relative to the worktree");
  const root = resolve(worktree);
  const target = resolve(root, filePath);
  if (target === root || !isWithin(root, target)) throw new Error("File path escapes the worktree");

  const realRoot = realpathSync(root);
  let existingAncestor = target;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) throw new Error("File path escapes the worktree");
    existingAncestor = parent;
  }
  if (!isWithin(realRoot, realpathSync(existingAncestor))) {
    throw new Error("File path escapes the worktree through a symbolic link");
  }
  return target;
}

export function applyHunkToWorktree(worktree: string, filePath: string, contents: string): void {
  const target = resolveWorktreePath(worktree, filePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

export function readWorktreeFile(worktree: string, filePath: string): string | null {
  const target = resolveWorktreePath(worktree, filePath);
  if (!existsSync(target)) return null;
  return readFileSync(target, "utf8");
}

function contentLines(contents: string): { lines: string[]; trailingNewline: boolean } {
  const trailingNewline = contents.endsWith("\n");
  const body = trailingNewline ? contents.slice(0, -1) : contents;
  return { lines: body ? body.split("\n") : [], trailingNewline };
}

function matchingIndex(lines: string[], expected: string[], preferred: number): number {
  const matchesAt = (index: number) =>
    index >= 0 &&
    index + expected.length <= lines.length &&
    expected.every((line, offset) => lines[index + offset] === line);
  if (matchesAt(preferred)) return preferred;
  if (!expected.length) return Math.min(Math.max(preferred, 0), lines.length);
  const matches = lines.flatMap((_, index) => (matchesAt(index) ? [index] : []));
  return matches.length === 1 ? matches[0]! : -1;
}

export function applyPatchHunkToWorktree(
  worktree: string,
  hunk: Hunk,
  direction: "forward" | "reverse",
): void {
  const current = readWorktreeFile(worktree, hunk.filePath) ?? "";
  const parsed = contentLines(current);
  const sourceText = direction === "forward" ? hunk.oldLines : hunk.newLines;
  const replacementText = direction === "forward" ? hunk.newLines : hunk.oldLines;
  const source = contentLines(sourceText).lines;
  const replacement = contentLines(replacementText).lines;
  const sourceStart = Math.max(0, (direction === "forward" ? hunk.oldStart : hunk.newStart) - 1);
  const replacementStart = Math.max(0, (direction === "forward" ? hunk.newStart : hunk.oldStart) - 1);

  let index: number;
  if (!source.length && replacement.length) {
    if (matchingIndex(parsed.lines, replacement, replacementStart) >= 0) return;
    index = Math.min(sourceStart, parsed.lines.length);
  } else {
    index = matchingIndex(parsed.lines, source, sourceStart);
    if (index < 0) {
      if (!replacement.length || matchingIndex(parsed.lines, replacement, replacementStart) >= 0) return;
      throw new Error(`Hunk no longer matches ${hunk.filePath}`);
    }
  }

  parsed.lines.splice(index, source.length, ...replacement);
  const trailingNewline =
    parsed.lines.length > 0 && (parsed.trailingNewline || replacementText.endsWith("\n"));
  const next = `${parsed.lines.join("\n")}${trailingNewline ? "\n" : ""}`;
  const target = resolveWorktreePath(worktree, hunk.filePath);
  if (direction === "reverse" && hunk.oldStart === 0 && !hunk.oldLines && !next) {
    rmSync(target, { force: true });
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, next);
}
