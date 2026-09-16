export type SkillSource = "repo" | "platform" | "user";

export type SkillIssue = { code: string; message: string };

export interface SkillDefinition {
  name: string;
  description: string;
  source: SkillSource;
  dir: string;
  body: string;
  paths: string[];
  manualOnly: boolean;
  icon?: string;
  color?: string;
  metadata?: Record<string, string>;
  scope?: string;
  issues: SkillIssue[];
}

export const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;

export function isSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name) && name.length <= 64 && !name.includes("--");
}

export function parseSkillFile(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const trimmed = text.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) return { frontmatter: {}, body: trimmed };
  const end = trimmed.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: {}, body: trimmed };
  const raw = trimmed.slice(4, end).replace(/^\n/, "");
  const body = trimmed.slice(end + 4).replace(/^\n/, "");
  return { frontmatter: parseSimpleYaml(raw), body };
}

export function validateSkill(folder: string, frontmatter: Record<string, unknown>): SkillIssue[] {
  const issues: SkillIssue[] = [];
  const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
  if (!name) issues.push({ code: "name-required", message: "Frontmatter name is required." });
  else if (!isSkillName(name)) {
    issues.push({ code: "name-format", message: "Name must be 1–64 lowercase letters, numbers, and hyphens." });
  } else if (name !== folder) {
    issues.push({ code: "name-folder", message: "Frontmatter name must match the parent folder." });
  }
  if (!description) issues.push({ code: "description-required", message: "Frontmatter description is required." });
  else if (description.length > 1024) {
    issues.push({ code: "description-length", message: "Description must be at most 1024 characters." });
  }
  return issues;
}

export function skillFromParsed(input: {
  folder: string;
  dir: string;
  source: SkillSource;
  frontmatter: Record<string, unknown>;
  body: string;
  scope?: string;
}): SkillDefinition {
  const name =
    typeof input.frontmatter.name === "string" && input.frontmatter.name.trim()
      ? input.frontmatter.name.trim()
      : input.folder;
  const description = typeof input.frontmatter.description === "string" ? input.frontmatter.description.trim() : "";
  const paths = globList(input.frontmatter.paths ?? input.frontmatter.globs);
  const manualOnly = input.frontmatter["disable-model-invocation"] === true;
  const icon = typeof input.frontmatter.icon === "string" ? input.frontmatter.icon : undefined;
  const color = typeof input.frontmatter.color === "string" ? input.frontmatter.color : undefined;
  const metadata =
    input.frontmatter.metadata && typeof input.frontmatter.metadata === "object" && !Array.isArray(input.frontmatter.metadata)
      ? Object.fromEntries(
          Object.entries(input.frontmatter.metadata as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === "string" ? value : String(value ?? ""),
          ]),
        )
      : undefined;
  return {
    name,
    description,
    source: input.source,
    dir: input.dir,
    body: input.body,
    paths,
    manualOnly,
    icon,
    color,
    metadata,
    scope: input.scope,
    issues: validateSkill(input.folder, input.frontmatter),
  };
}

export function skillCatalog(found: SkillDefinition[]): { skills: SkillDefinition[]; shadowed: SkillDefinition[] } {
  const rank: Record<SkillSource, number> = { repo: 0, user: 1, platform: 2 };
  const ranked = [...found].sort((a, b) => rank[a.source] - rank[b.source]);
  const byName = new Map<string, SkillDefinition>();
  const shadowed: SkillDefinition[] = [];
  for (const skill of ranked) {
    const existing = byName.get(skill.name);
    if (existing) shadowed.push(skill);
    else byName.set(skill.name, skill);
  }
  return { skills: [...byName.values()], shadowed };
}

export function renderSkillFile(definition: Pick<SkillDefinition, "name" | "description" | "paths" | "manualOnly" | "icon" | "color" | "metadata">, body: string): string {
  const lines = ["---", `name: ${definition.name}`, `description: ${yamlScalar(definition.description)}`];
  if (definition.paths.length) {
    lines.push("paths:");
    for (const path of definition.paths) lines.push(`  - ${yamlScalar(path)}`);
  }
  if (definition.manualOnly) lines.push("disable-model-invocation: true");
  if (definition.icon) lines.push(`icon: ${yamlScalar(definition.icon)}`);
  if (definition.color) lines.push(`color: ${yamlScalar(definition.color)}`);
  if (definition.metadata && Object.keys(definition.metadata).length) {
    lines.push("metadata:");
    for (const [key, value] of Object.entries(definition.metadata)) {
      lines.push(`  ${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---", "", body.trimEnd(), "");
  return lines.join("\n");
}

export function slashQuery(text: string): string | null {
  if (!text.startsWith("/")) return null;
  const rest = text.slice(1);
  if (!rest.length) return "";
  if (/[\s\n]/.test(rest)) return null;
  return rest;
}

export function slashInvocation(text: string): string | null {
  const match = text.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s|$)/);
  return match?.[1] ?? null;
}

export function slashMatches<T extends { name: string; description: string; manualOnly?: boolean }>(
  catalog: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  const hits = catalog.filter((row) => {
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle);
  });
  return hits.sort((a, b) => {
    const aManual = a.manualOnly ? 0 : 1;
    const bManual = b.manualOnly ? 0 : 1;
    if (aManual !== bManual) return aManual - bManual;
    const aPrefix = needle && a.name.toLowerCase().startsWith(needle) ? 0 : 1;
    const bPrefix = needle && b.name.toLowerCase().startsWith(needle) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.name.localeCompare(b.name);
  });
}

function globList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function yamlScalar(value: string): string {
  if (value === "") return '""';
  if (/[:#\n"'{}[\],&*?|><%@`]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> | unknown[] }> = [{ indent: -1, target: root }];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const line = rawLine.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.target;

    if (line.startsWith("- ")) {
      const item = parseYamlValue(line.slice(2).trim());
      if (Array.isArray(parent)) parent.push(item);
      continue;
    }

    const sep = line.indexOf(":");
    if (sep < 1 || Array.isArray(parent)) continue;
    const key = line.slice(0, sep).trim();
    const rest = line.slice(sep + 1).trim();
    if (rest) {
      parent[key] = parseYamlValue(rest);
      continue;
    }
    let peek: string | undefined;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next.trim() || next.trimStart().startsWith("#")) continue;
      peek = next;
      break;
    }
    const peekIndent = peek ? (peek.match(/^ */)?.[0].length ?? 0) : -1;
    const child: Record<string, unknown> | unknown[] =
      peek && peekIndent > indent && peek.trimStart().startsWith("- ") ? [] : {};
    parent[key] = child;
    stack.push({ indent, target: child });
  }
  return root;
}

function parseYamlValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "~") return null;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((item) => String(parseYamlValue(item.trim())))
      .filter((item) => item !== "");
  }
  return raw;
}
