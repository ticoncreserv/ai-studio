import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyProviderCredential,
  credentialKeepKeys,
  hasProviderCredential,
  providerSecretKey,
  readProviderCredential,
} from "./credentials.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("provider credentials", () => {
  it("maps canonical secret keys and aliases", () => {
    expect(providerSecretKey("cursor")).toBe("CURSOR_API_KEY");
    expect(providerSecretKey("claude")).toBe("ANTHROPIC_API_KEY");
    expect(providerSecretKey("gemini")).toBe("GEMINI_API_KEY");
    expect(providerSecretKey("grok")).toBe("XAI_API_KEY");
    expect(credentialKeepKeys("claude")).toEqual(["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]);
    expect(readProviderCredential("claude", { CLAUDE_API_KEY: "alias" })).toBe("alias");
    expect(hasProviderCredential("gemini", { GOOGLE_API_KEY: "g" })).toBe(true);
  });

  it("reads provider.env overlays and copies the canonical key", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-cred-"));
    dirs.push(dir);
    mkdirSync(join(dir, "env"), { recursive: true });
    writeFileSync(join(dir, "env", "providers.env"), "XAI_API_KEY=xai-test\n");
    expect(readProviderCredential("grok", {}, join(dir, "env"))).toBe("xai-test");
    expect(applyProviderCredential("grok", {}, join(dir, "env")).XAI_API_KEY).toBe("xai-test");
  });
});
