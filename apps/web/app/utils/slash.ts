import { slashInvocation, slashMatches, slashQuery } from "@atelier/domain";

export { slashInvocation, slashMatches, slashQuery };

export type SlashSource = "repo" | "platform" | "user" | "agent";

export type SlashRow = {
  name: string;
  description: string;
  source: SlashSource;
  manualOnly?: boolean;
};

export const MCP_SERVER_WARN_THRESHOLD = 8;

export function mergeSlashCatalog(
  skills: Array<{
    name: string;
    description: string;
    source: "repo" | "platform" | "user";
    manualOnly?: boolean;
    enabled?: boolean;
    shadowed?: boolean;
  }>,
  commands: Array<{ name: string; description?: string; hint?: string }>,
): SlashRow[] {
  const map = new Map<string, SlashRow>();
  for (const skill of skills) {
    if (skill.enabled === false || skill.shadowed) continue;
    map.set(skill.name, {
      name: skill.name,
      description: skill.description,
      source: skill.source,
      manualOnly: skill.manualOnly,
    });
  }
  for (const command of commands) {
    if (map.has(command.name)) continue;
    map.set(command.name, {
      name: command.name,
      description: command.description || command.hint || "",
      source: "agent",
    });
  }
  return [...map.values()];
}

export function insertSlashCommand(prompt: string, name: string): string {
  const rest = prompt.replace(/^\/[^\s]*/, "").replace(/^\s*/, "");
  return rest ? `/${name} ${rest}` : `/${name} `;
}

export function removeSlashCommand(prompt: string, name?: string | null): string {
  if (name) {
    const prefix = new RegExp(`^/${name}(?:\\s+|$)`);
    if (prefix.test(prompt)) return prompt.replace(prefix, "");
  }
  return prompt.replace(/^\/[a-z0-9]+(?:-[a-z0-9]+)*\s*/, "");
}

export function resolvedSlashSkill(text: string, names: Iterable<string>): string | null {
  const name = slashInvocation(text);
  if (!name) return null;
  const allowed = names instanceof Set ? names : new Set(names);
  return allowed.has(name) ? name : null;
}

/** A catalog skill becomes a composer token only after a trailing space (or menu insert). */
export function committedSlashSkill(text: string, names: Iterable<string>): string | null {
  const name = resolvedSlashSkill(text, names);
  if (!name) return null;
  const prefix = `/${name}`;
  if (text.startsWith(`${prefix} `) || text.startsWith(`${prefix}\n`)) return name;
  return null;
}

export function composerVisiblePrompt(prompt: string, skill: string | null | undefined): string {
  if (!skill) return prompt;
  return removeSlashCommand(prompt, skill);
}

export function composePromptWithSkill(skill: string | null | undefined, visible: string): string {
  if (!skill) return visible;
  return insertSlashCommand(visible, skill);
}

export function shouldClearSkillToken(input: {
  key: string;
  selectionStart: number;
  selectionEnd: number;
  hasSkill: boolean;
}): boolean {
  return input.hasSkill && input.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0;
}

export function mcpServerFromToolName(name: string): string | null {
  const cleaned = name.replaceAll("`", "").trim();
  const match = cleaned.match(/^mcp[_-]([a-z0-9][a-z0-9-]*)[_-]/i);
  return match?.[1] ?? null;
}
