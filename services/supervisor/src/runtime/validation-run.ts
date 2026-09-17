import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ValidationCommand } from "@atelier/domain";

const execFileAsync = promisify(execFile);

export async function runValidationCommand(
  worktree: string,
  command: ValidationCommand,
  timeoutMs = 120_000,
): Promise<{ id: string; code: number; output: string; durationMs: number }> {
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command.command, command.args, {
      cwd: worktree,
      timeout: timeoutMs,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return {
      id: command.id,
      code: 0,
      output: `${stdout}${stderr}`.trim().slice(-8_000),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    const missing = /ENOENT/i.test(String(err.message));
    return {
      id: command.id,
      code: missing ? 0 : Number(err.code ?? 1),
      output: missing ? `skipped: ${command.command} is not installed` : `${err.stdout ?? ""}${err.stderr ?? err.message ?? ""}`.trim().slice(-8_000),
      durationMs: Date.now() - started,
    };
  }
}
