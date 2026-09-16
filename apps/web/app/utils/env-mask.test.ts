import { describe, expect, it } from "vitest";
import { isSecretEnvKey, REDACTED_ENV_VALUE, visibleEnvValue } from "./env-mask";

describe("env-mask", () => {
  it("treats tokens and keys as secret except *_NAME", () => {
    expect(isSecretEnvKey("APP_KEY")).toBe(true);
    expect(isSecretEnvKey("MAILERSEND_API_KEY")).toBe(true);
    expect(isSecretEnvKey("DB_PASSWORD")).toBe(true);
    expect(isSecretEnvKey("APP_NAME")).toBe(false);
    expect(isSecretEnvKey("APP_KEY_NAME")).toBe(false);
  });

  it("reveals from the secret cache without rewriting the draft value", () => {
    const draft = REDACTED_ENV_VALUE;
    expect(visibleEnvValue(draft, false, "base64:fixture-key")).toBe(REDACTED_ENV_VALUE);
    expect(visibleEnvValue(draft, true, "base64:fixture-key")).toBe("base64:fixture-key");
    expect(draft).toBe(REDACTED_ENV_VALUE);
  });

  it("keeps an edited draft even while hidden", () => {
    expect(visibleEnvValue("new-secret", false, "base64:fixture-key")).toBe("new-secret");
  });
});
