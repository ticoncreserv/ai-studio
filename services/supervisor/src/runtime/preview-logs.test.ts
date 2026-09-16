import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendPreviewLog, readPreviewLogs, suggestPreviewFixes, writePreviewLogs } from "./preview-logs.js";

describe("preview logs", () => {
  it("persists artisan/vite tails and suggests fixes", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-logs-"));
    const envRoot = join(root, "env");
    try {
      appendPreviewLog("ws1", "artisan", "boot\n", envRoot);
      appendPreviewLog("ws1", "artisan", "ENOSPC: System limit for number of file watchers reached\n", envRoot);
      writePreviewLogs("ws1", { vite: "Vite ready\n", error: "Vite did not start in dev mode" }, envRoot);
      const logs = readPreviewLogs("ws1", envRoot);
      expect(logs.artisan).toContain("ENOSPC");
      expect(logs.vite).toContain("Vite ready");
      expect(logs.error).toContain("Vite did not start");
      const hints = suggestPreviewFixes(logs.error ?? "", logs.artisan);
      expect(hints.some((row) => row.id === "enospc")).toBe(true);
      expect(hints.some((row) => row.id === "vite")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
