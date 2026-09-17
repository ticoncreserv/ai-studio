export interface ValidationCommand {
  id: string;
  command: string;
  args: string[];
}

export function selectValidationCommands(paths: string[]): ValidationCommand[] {
  const unique = [...new Set(paths)];
  const commands: ValidationCommand[] = [];
  if (unique.some((path) => path.endsWith(".php"))) {
    commands.push({ id: "php-tests", command: "php", args: ["artisan", "test", "--parallel=0"] });
  }
  if (unique.some((path) => /\.(vue|ts|tsx|js)$/.test(path))) {
    commands.push({ id: "frontend-test", command: "npm", args: ["test", "--", "--run"] });
  }
  if (unique.some((path) => path.includes("database/migrations/"))) {
    commands.push({ id: "migrate-status", command: "php", args: ["artisan", "migrate:status", "--no-interaction"] });
  }
  return commands;
}

export function summarizeValidation(
  results: Array<{ id: string; code: number; output: string; durationMs: number }>,
): "passed" | "failed" | "skipped" {
  if (!results.length) return "skipped";
  return results.every((row) => row.code === 0) ? "passed" : "failed";
}
