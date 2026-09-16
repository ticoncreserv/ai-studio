export const REDACTED_ENV_VALUE = "••••";

export function isSecretEnvKey(key: string): boolean {
  return /password|secret|token|key|private/i.test(key) && !key.endsWith("_NAME");
}

/** Shown value for a secret row. Does not copy plaintext into the draft. */
export function visibleEnvValue(value: string, revealed: boolean, secret: string | undefined): string {
  if (revealed && value === REDACTED_ENV_VALUE && secret != null) return secret;
  return value;
}

function parseEnvAssignment(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const i = trimmed.indexOf("=");
  if (i < 1) return null;
  let value = trimmed.slice(i + 1);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key: trimmed.slice(0, i), value };
}

function formatEnvAssignmentValue(value: string): string {
  return value.includes(" ") || value.includes("#") ? JSON.stringify(value) : value;
}

function parseEnvAssignments(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const parsed = parseEnvAssignment(line);
    if (parsed) out[parsed.key] = parsed.value;
  }
  return out;
}

function mapEnvLines(text: string, mapValue: (key: string, value: string) => string): string {
  return text
    .split("\n")
    .map((line) => {
      const parsed = parseEnvAssignment(line);
      if (!parsed) return line;
      const next = mapValue(parsed.key, parsed.value);
      if (next === parsed.value) return line;
      return `${parsed.key}=${formatEnvAssignmentValue(next)}`;
    })
    .join("\n");
}

/** Textarea contents for the raw env file. Does not copy plaintext into the draft. */
export function visibleRawEnv(
  text: string,
  revealed: boolean,
  secrets: Record<string, string> | undefined,
): string {
  return mapEnvLines(text, (key, value) => {
    if (!isSecretEnvKey(key)) return value;
    if (!revealed) return REDACTED_ENV_VALUE;
    return visibleEnvValue(value, true, secrets?.[key]);
  });
}

/**
 * Merge textarea edits into the raw draft. Masked (`••••`) secret lines keep the
 * previous draft value so toggling reveal cannot write bullets over real data.
 */
export function mergeRawEnvInput(
  displayed: string,
  draft: string,
  secrets: Record<string, string> | undefined,
): string {
  const previous = parseEnvAssignments(draft);
  return mapEnvLines(displayed, (key, value) => {
    if (!isSecretEnvKey(key)) return value;
    if (value === REDACTED_ENV_VALUE) return previous[key] ?? REDACTED_ENV_VALUE;
    const cached = secrets?.[key];
    const prior = previous[key];
    if (cached != null && value === cached && (prior == null || prior === REDACTED_ENV_VALUE)) {
      return prior ?? REDACTED_ENV_VALUE;
    }
    return value;
  });
}
