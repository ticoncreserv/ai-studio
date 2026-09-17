import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyProviderKeyState, markProviderKeyFailure } from "@atelier/domain";
import {
  applyProviderCredential,
  credentialKeepKeys,
  hasProviderCredential,
  hydrateProviderKeys,
  isProviderKeyRef,
  listProviderCredentials,
  providerCredentialCandidates,
  providerKeyRefs,
  providerSecretKey,
  readProviderCredential,
  withProviderCredential,
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

  it("lists every key slot in order and ignores duplicates", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-cred-slots-"));
    dirs.push(dir);
    mkdirSync(join(dir, "env"), { recursive: true });
    writeFileSync(
      join(dir, "env", "providers.env"),
      "CURSOR_API_KEY=one\nCURSOR_API_KEY_2=two\nCURSOR_API_KEY_3=two\nCURSOR_API_KEY_4=four\n",
    );
    expect(listProviderCredentials("cursor", {}, join(dir, "env"))).toEqual([
      { ref: "CURSOR_API_KEY", value: "one" },
      { ref: "CURSOR_API_KEY_2", value: "two" },
      { ref: "CURSOR_API_KEY_4", value: "four" },
    ]);
    expect(providerKeyRefs("cursor")[1]).toBe("CURSOR_API_KEY_2");
    expect(isProviderKeyRef("cursor", "CURSOR_API_KEY_4")).toBe(true);
    expect(isProviderKeyRef("cursor", "ANTHROPIC_API_KEY")).toBe(false);
  });

  it("orders failover candidates by roster health", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-cred-failover-"));
    dirs.push(dir);
    mkdirSync(join(dir, "env"), { recursive: true });
    writeFileSync(join(dir, "env", "providers.env"), "CURSOR_API_KEY=one\nCURSOR_API_KEY_2=two\nCURSOR_API_KEY_3=three\n");
    const now = new Date("2026-09-17T10:00:00.000Z");
    const keys = [
      markProviderKeyFailure(emptyProviderKeyState("CURSOR_API_KEY"), { message: "429", now }),
      emptyProviderKeyState("CURSOR_API_KEY_2"),
    ];
    expect(providerCredentialCandidates("cursor", keys, {}, join(dir, "env"), now)).toEqual([
      { ref: "CURSOR_API_KEY_2", value: "two" },
      { ref: "CURSOR_API_KEY", value: "one" },
      { ref: "CURSOR_API_KEY_3", value: "three" },
    ]);
  });

  it("keeps only the chosen key in the agent environment", () => {
    const env = withProviderCredential("claude", { ANTHROPIC_API_KEY: "one", CLAUDE_API_KEY: "alias", PATH: "/bin" }, "two");
    expect(env).toEqual({ ANTHROPIC_API_KEY: "two", PATH: "/bin" });
  });

  it("hydrates a roster with secrets that were not added in admin", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-cred-hydrate-"));
    dirs.push(dir);
    mkdirSync(join(dir, "env"), { recursive: true });
    writeFileSync(join(dir, "env", "providers.env"), "CURSOR_API_KEY=one\nCURSOR_API_KEY_2=two\n");
    const keys = hydrateProviderKeys("cursor", [emptyProviderKeyState("CURSOR_API_KEY", "primary")], {}, join(dir, "env"));
    expect(keys.map((row) => row.ref)).toEqual(["CURSOR_API_KEY", "CURSOR_API_KEY_2"]);
    expect(keys[0]?.label).toBe("primary");
  });
});
