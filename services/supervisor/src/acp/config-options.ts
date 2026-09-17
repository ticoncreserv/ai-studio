import type { ProviderModel } from "@atelier/contracts";

/**
 * Session config option as advertised by `session/new`, `session/load`, and
 * `session/set_config_option`. ACP v1 names the identifier `id`; v2 renames it to
 * `configId` while the request parameter stayed `configId` in both.
 */
export interface AcpConfigOption {
  id?: string;
  configId?: string;
  name?: string;
  description?: string;
  category?: string;
  type?: string;
  currentValue?: unknown;
  options?: Array<{ value?: string; name?: string; description?: string }>;
}

export function configOptionId(option: AcpConfigOption): string {
  return option.configId ?? option.id ?? "";
}

export function readConfigOptions(result: unknown): AcpConfigOption[] {
  const options = (result as { configOptions?: unknown } | null | undefined)?.configOptions;
  if (!Array.isArray(options)) return [];
  return options.filter((row): row is AcpConfigOption => Boolean(row) && typeof row === "object");
}

export function findModelOption(options: AcpConfigOption[]): AcpConfigOption | undefined {
  return (
    options.find((option) => option.category === "model") ??
    options.find((option) => configOptionId(option) === "model")
  );
}

export function modelOptionValues(option: AcpConfigOption | undefined): ProviderModel[] {
  return (option?.options ?? [])
    .map((row) => ({
      id: String(row.value ?? "").trim(),
      label: String(row.name ?? "").trim() || String(row.value ?? "").trim(),
      description: row.description?.trim() || undefined,
    }))
    .filter((row) => row.id.length > 0);
}

export function currentModelId(option: AcpConfigOption | undefined): string | undefined {
  const value = option?.currentValue;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Match an admin-pinned model against what the agent advertises. Falls back to the
 * raw value so vendor aliases (`sonnet`, `auto`) still reach agents that only list
 * fully-qualified ids.
 */
export function resolveModelValue(option: AcpConfigOption | undefined, wanted: string): string {
  const value = wanted.trim();
  const values = modelOptionValues(option);
  if (!value || !values.length) return value;
  const exact = values.find((row) => row.id === value);
  if (exact) return exact.id;
  const lower = value.toLowerCase();
  const insensitive = values.find((row) => row.id.toLowerCase() === lower);
  if (insensitive) return insensitive.id;
  const byLabel = values.find((row) => row.label.toLowerCase() === lower);
  if (byLabel) return byLabel.id;
  const prefixed = values.find((row) => row.id.toLowerCase().startsWith(lower));
  if (prefixed) return prefixed.id;
  return value;
}
