import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cursorAgentHomeBin, ensureCursorAgent, findCursorAgentBinary } from "./ensure-agent.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ensureCursorAgent", () => {
  it("returns an existing ~/.local/bin/agent without installing", async () => {
    const home = mkdtempSync(join(tmpdir(), "atelier-agent-"));
    dirs.push(home);
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const bin = cursorAgentHomeBin(home);
    writeFileSync(bin, "#!/bin/sh\n");
    const install = vi.fn(async () => {
      throw new Error("should not install");
    });
    await expect(
      ensureCursorAgent({
        env: { ATELIER_AGENT_HOME: home, PATH: "/usr/bin" },
        install,
      }),
    ).resolves.toBe(bin);
    expect(install).not.toHaveBeenCalled();
  });

  it("skips the network installer under VITEST when the binary is missing", async () => {
    const install = vi.fn(async () => undefined);
    const home = mkdtempSync(join(tmpdir(), "atelier-agent-empty-"));
    dirs.push(home);
    await expect(
      ensureCursorAgent({ env: { ATELIER_AGENT_HOME: home, PATH: "/usr/bin", VITEST: "true" }, install }),
    ).rejects.toThrow(/not installed/);
    expect(install).not.toHaveBeenCalled();
  });

  it("runs the installer and then resolves the new binary", async () => {
    const home = mkdtempSync(join(tmpdir(), "atelier-agent-"));
    dirs.push(home);
    const bin = cursorAgentHomeBin(home);
    const install = vi.fn(async () => {
      mkdirSync(join(home, ".local", "bin"), { recursive: true });
      writeFileSync(bin, "#!/bin/sh\n");
    });
    await expect(ensureCursorAgent({ env: { ATELIER_AGENT_HOME: home, PATH: "/usr/bin" }, install })).resolves.toBe(bin);
    expect(install).toHaveBeenCalledOnce();
    expect(findCursorAgentBinary({ ATELIER_AGENT_HOME: home })).toBe(bin);
  });
});
