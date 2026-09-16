import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dependencyFingerprint, hydrateDependencySnapshots, persistDependencySnapshots } from "./deps-cache.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "atelier-deps-"));
  dirs.push(dir);
  return dir;
}

describe("dependency snapshots", () => {
  it("hydrates vendor and node_modules from a fingerprint cache", () => {
    const root = tempDir();
    const first = join(tempDir(), "ws-a");
    const second = join(tempDir(), "ws-b");
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    writeFileSync(join(first, "composer.lock"), '{"packages":[]}');
    writeFileSync(join(first, "package-lock.json"), '{"packages":{}}');
    mkdirSync(join(first, "vendor"), { recursive: true });
    mkdirSync(join(first, "node_modules", "vite"), { recursive: true });
    writeFileSync(join(first, "vendor", "autoload.php"), "<?php");
    writeFileSync(join(first, "node_modules", "vite", "package.json"), "{}");
    persistDependencySnapshots(first, root);

    writeFileSync(join(second, "composer.lock"), readFileSync(join(first, "composer.lock")));
    writeFileSync(join(second, "package-lock.json"), readFileSync(join(first, "package-lock.json")));
    expect(dependencyFingerprint(first)).toBe(dependencyFingerprint(second));
    hydrateDependencySnapshots(second, root);
    expect(readFileSync(join(second, "vendor", "autoload.php"), "utf8")).toBe("<?php");
    expect(readFileSync(join(second, "node_modules", "vite", "package.json"), "utf8")).toBe("{}");
  });
});
