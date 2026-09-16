export const REDACTED_ENV_VALUE = "••••";

export function isSecretEnvKey(key: string): boolean {
  return /password|secret|token|key|private/i.test(key) && !key.endsWith("_NAME");
}

/** Shown value for a secret row. Does not copy plaintext into the draft. */
export function visibleEnvValue(value: string, revealed: boolean, secret: string | undefined): string {
  if (revealed && value === REDACTED_ENV_VALUE && secret != null) return secret;
  return value;
}
