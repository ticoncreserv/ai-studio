import { describe, expect, it } from "vitest";
import {
  isSecretEnvKey,
  mergeRawEnvInput,
  REDACTED_ENV_VALUE,
  visibleEnvValue,
  visibleRawEnv,
} from "./env-mask";

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

  const rawDraft = [
    "APP_NAME=Portal",
    `APP_KEY=${REDACTED_ENV_VALUE}`,
    "# keep comments",
    `DB_PASSWORD=${REDACTED_ENV_VALUE}`,
    "APP_KEY_NAME=primary",
    "",
  ].join("\n");
  const secrets = { APP_KEY: "base64:fixture-key", DB_PASSWORD: "s3cret" };

  it("masks only secret keys in the raw file until revealed", () => {
    expect(visibleRawEnv(rawDraft, false, secrets)).toBe(rawDraft);
    expect(visibleRawEnv(rawDraft, true, secrets)).toBe(
      [
        "APP_NAME=Portal",
        "APP_KEY=base64:fixture-key",
        "# keep comments",
        "DB_PASSWORD=s3cret",
        "APP_KEY_NAME=primary",
        "",
      ].join("\n"),
    );
    expect(rawDraft).toContain(`APP_KEY=${REDACTED_ENV_VALUE}`);
  });

  it("hides edited secret lines again without reading them from the draft display", () => {
    const edited = rawDraft.replace(`APP_KEY=${REDACTED_ENV_VALUE}`, "APP_KEY=new-key");
    expect(visibleRawEnv(edited, false, secrets)).toContain(`APP_KEY=${REDACTED_ENV_VALUE}`);
    expect(visibleRawEnv(edited, true, secrets)).toContain("APP_KEY=new-key");
  });

  it("does not write bullets or cached secrets into the draft when merging a masked or revealed view", () => {
    const revealed = visibleRawEnv(rawDraft, true, secrets);
    expect(mergeRawEnvInput(revealed, rawDraft, secrets)).toBe(rawDraft);

    const renamed = revealed.replace("APP_NAME=Portal", "APP_NAME=Atelier");
    expect(mergeRawEnvInput(renamed, rawDraft, secrets)).toBe(rawDraft.replace("Portal", "Atelier"));

    const maskedEdit = visibleRawEnv(rawDraft, false, secrets).replace("APP_NAME=Portal", "APP_NAME=Atelier");
    expect(mergeRawEnvInput(maskedEdit, rawDraft, secrets)).toBe(rawDraft.replace("Portal", "Atelier"));
  });

  it("keeps a prior secret edit when the masked line is still bullets", () => {
    const draft = rawDraft.replace(`APP_KEY=${REDACTED_ENV_VALUE}`, "APP_KEY=new-key");
    const masked = visibleRawEnv(draft, false, secrets);
    expect(masked).toContain(`APP_KEY=${REDACTED_ENV_VALUE}`);
    expect(mergeRawEnvInput(masked, draft, secrets)).toContain("APP_KEY=new-key");
  });

  it("writes a secret the user actually changed in the textarea", () => {
    const revealed = visibleRawEnv(rawDraft, true, secrets).replace("base64:fixture-key", "rotated-key");
    expect(mergeRawEnvInput(revealed, rawDraft, secrets)).toContain("APP_KEY=rotated-key");
    expect(mergeRawEnvInput(revealed, rawDraft, secrets)).toContain(`DB_PASSWORD=${REDACTED_ENV_VALUE}`);

    const typedWhileMasked = visibleRawEnv(rawDraft, false, secrets).replace(
      `DB_PASSWORD=${REDACTED_ENV_VALUE}`,
      "DB_PASSWORD=typed-secret",
    );
    expect(mergeRawEnvInput(typedWhileMasked, rawDraft, secrets)).toContain("DB_PASSWORD=typed-secret");
  });
});
