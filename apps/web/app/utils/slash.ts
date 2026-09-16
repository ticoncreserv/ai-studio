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

export function mcpServerFromToolName(name: string): string | null {
  const cleaned = name.replaceAll("`", "").trim();
  const match = cleaned.match(/^mcp[_-]([a-z0-9][a-z0-9-]*)[_-]/i);
  return match?.[1] ?? null;
}
