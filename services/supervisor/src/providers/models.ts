import type { ProviderId, ProviderModel } from "@atelier/contracts";

/**
 * How each CLI takes a model before ACP starts. `flag` is only used where the
 * agent documents it, because an unknown flag stops the process from launching;
 * `env` is inert when the agent ignores it. Agents that advertise the ACP `model`
 * config option are also set over the protocol after `session/new`.
 */
export interface ProviderModelTransport {
  flag?: string;
  env?: string[];
}

export const PROVIDER_MODEL_TRANSPORT: Record<ProviderId, ProviderModelTransport> = {
  cursor: { flag: "--model" },
  codex: {},
  claude: { env: ["ANTHROPIC_MODEL"] },
  gemini: { flag: "--model", env: ["GEMINI_MODEL"] },
  grok: { flag: "--model", env: ["GROK_DEFAULT_MODEL"] },
  mock: {},
};

/**
 * Starting points for the admin picker. Agents that advertise their own list
 * replace these once a session has run, so the catalog only has to be plausible.
 */
export const PROVIDER_MODEL_CATALOG: Record<ProviderId, ProviderModel[]> = {
  cursor: [
    { id: "auto", label: "Auto" },
    { id: "composer-2.5", label: "Composer 2.5" },
    { id: "composer-2.5-fast", label: "Composer 2.5 Fast" },
    { id: "gpt-5.3-codex", label: "Codex 5.3" },
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "cursor-grok-4.6-high", label: "Cursor Grok 4.6" },
    { id: "claude-opus-5-high", label: "Claude Opus 5" },
    { id: "claude-sonnet-5-thinking-high", label: "Claude Sonnet 5 Thinking" },
    { id: "gemini-3.7-flash-high", label: "Gemini 3.7 Flash" },
  ],
  codex: [
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
  ],
  claude: [
    { id: "default", label: "Default" },
    { id: "sonnet", label: "Sonnet" },
    { id: "opus", label: "Opus" },
    { id: "haiku", label: "Haiku" },
  ],
  gemini: [
    { id: "auto", label: "Auto" },
    { id: "gemini-3-flash", label: "Gemini 3 Flash" },
    { id: "gemini-3-pro", label: "Gemini 3 Pro" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  grok: [
    { id: "grok-4.5", label: "Grok 4.5" },
    { id: "grok-4", label: "Grok 4" },
    { id: "grok-build", label: "Grok Build" },
  ],
  mock: [{ id: "mock-1", label: "Mock 1" }],
};

export function providerModelCatalog(id: string): ProviderModel[] {
  return PROVIDER_MODEL_CATALOG[id as ProviderId] ?? [];
}

/** Union of every source, first label wins, `id` order preserved. */
export function mergeProviderModels(...lists: Array<ProviderModel[] | undefined>): ProviderModel[] {
  const out = new Map<string, ProviderModel>();
  for (const list of lists) {
    for (const model of list ?? []) {
      const id = model.id.trim();
      if (!id) continue;
      const current = out.get(id);
      if (!current) out.set(id, { ...model, id, label: model.label?.trim() || id });
      else if (!current.description && model.description) out.set(id, { ...current, description: model.description });
    }
  }
  return [...out.values()];
}

export function modelArgs(id: string, model?: string): string[] {
  const value = model?.trim();
  const flag = PROVIDER_MODEL_TRANSPORT[id as ProviderId]?.flag;
  if (!value || !flag) return [];
  return [flag, value];
}

export function applyModelEnv(id: string, env: NodeJS.ProcessEnv, model?: string): NodeJS.ProcessEnv {
  const value = model?.trim();
  const names = PROVIDER_MODEL_TRANSPORT[id as ProviderId]?.env ?? [];
  if (!value || !names.length) return { ...env };
  const next = { ...env };
  for (const name of names) next[name] = value;
  return next;
}
