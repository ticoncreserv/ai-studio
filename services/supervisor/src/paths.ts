import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function repoRoot(): string {
  const env = process.env.ATELIER_ROOT;
  if (env && existsSync(join(env, "pnpm-workspace.yaml"))) return env;
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function fixtureAppDir(): string {
  return join(repoRoot(), "fixtures/laravel-app");
}

export function previewServerScript(): string {
  return join(repoRoot(), "scripts/preview-server.mjs");
}
