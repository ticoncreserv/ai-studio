export type RuleLevel = "platform" | "project" | "user";

export interface RuleRecord {
  id: string;
  level: RuleLevel;
  title: string;
  body: string;
  description: string;
  slug: string;
  alwaysApply: boolean;
  userId?: string | null;
}

/** @deprecated Use RuleRecord. Kept so older imports keep compiling. */
export type RuleLayer = RuleRecord;

export interface CompiledRules {
  provenance: Array<{ id: string; level: string; title: string; slug: string }>;
  markdown: string;
  files: Array<{ path: string; contents: string }>;
}

export const RULE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;

const LEVEL_ORDER: Record<RuleLevel, number> = { platform: 0, project: 1, user: 2 };

export function isRuleSlug(value: string): boolean {
  return RULE_SLUG_PATTERN.test(value) && value.length <= 64 && !value.includes("--");
}

export function slugifyRuleTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return isRuleSlug(slug) ? slug : "";
}

export function isLegacyUserRule(rule: Pick<RuleRecord, "level" | "userId">): boolean {
  return rule.level === "user" && !rule.userId;
}

export function normalizeRule(
  input: Partial<RuleRecord> & Pick<RuleRecord, "id" | "level" | "title" | "body">,
): RuleRecord {
  const fromTitle = slugifyRuleTitle(input.title);
  const slug =
    input.slug && isRuleSlug(input.slug) ? input.slug : fromTitle || `rule-${input.id.replace(/[^a-z0-9]/gi, "").slice(0, 12) || "item"}`;
  return {
    id: input.id,
    level: input.level,
    title: input.title,
    body: input.body,
    description: (input.description ?? "").trim() || input.title,
    slug,
    alwaysApply: input.alwaysApply !== false,
    userId: input.level === "user" ? input.userId ?? null : null,
  };
}

export function storedRules(rules: RuleRecord[]): RuleRecord[] {
  return rules.filter((row) => !isLegacyUserRule(row)).map((row) => normalizeRule(row));
}

export function rulesForActor(rules: RuleRecord[], actorId: string): RuleRecord[] {
  return storedRules(rules)
    .filter((row) => row.level !== "user" || row.userId === actorId)
    .sort(compareRules);
}

export function rulesForWorktreeOwner(rules: RuleRecord[], ownerId: string): RuleRecord[] {
  return rulesForActor(rules, ownerId);
}

export function adminRules(rules: RuleRecord[]): RuleRecord[] {
  return storedRules(rules)
    .filter((row) => row.level !== "user")
    .sort(compareRules);
}

export function ruleFileName(rule: RuleRecord): string {
  const slug = rule.slug || slugifyRuleTitle(rule.title) || rule.id;
  return rule.level === "user" ? `user-${slug}.mdc` : `${rule.level}-${slug}.mdc`;
}

export function renderRuleFile(rule: RuleRecord): string {
  const description = yamlScalar(rule.description || rule.title);
  return `---\ndescription: ${description}\nalwaysApply: ${rule.alwaysApply !== false}\n---\n\n${rule.body}\n`;
}

export const DEFAULT_RULES: RuleRecord[] = [
  {
    id: "platform",
    level: "platform",
    title: "Safety",
    slug: "safety",
    description: "Never wipe databases or read env files.",
    body: "Never run migrate:fresh, db:wipe, or write to ERP connections. Do not read .env files.",
    alwaysApply: true,
  },
  {
    id: "repository-actions",
    level: "platform",
    title: "Repository actions",
    slug: "repository-actions",
    description: "Inspect, preserve unrelated work, and validate before reporting done.",
    body: "Work only inside the current repository. Inspect relevant files before editing, preserve unrelated user changes, make the smallest coherent change, follow existing conventions, and run targeted validation before reporting completion.",
    alwaysApply: true,
  },
  {
    id: "workaround-comments",
    level: "platform",
    title: "Workaround comments",
    slug: "workaround-comments",
    description: "Workaround comments are normative.",
    body: "Do not remove or refactor code that has an explanatory workaround comment unless the user explicitly asks.",
    alwaysApply: true,
  },
  {
    id: "project",
    level: "project",
    title: "Concreserv",
    slug: "concreserv",
    description: "Inertia, Vue, and Laravel Boost conventions.",
    body: "Follow Inertia + Vue page conventions. Keep Laravel Boost MCP available.",
    alwaysApply: true,
  },
];

export function compileRules(layers: RuleRecord[], locale: "en" | "pt-BR"): CompiledRules {
  const normalized = storedRules(layers).sort(compareRules);
  const languageRule =
    locale === "pt-BR"
      ? "Reply to the user in Brazilian Portuguese. Write all code, identifiers, comments, and commit messages in English."
      : "Reply to the user in English. Write all code, identifiers, comments, and commit messages in English.";
  const applied = normalized.filter((row) => row.alwaysApply);
  const markdown = ["# Agent instructions", "", languageRule, "", ...applied.map((row) => `## ${row.title}\n\n${row.body}`)].join(
    "\n",
  );
  const files = normalized.map((row) => ({
    path: `.cursor/rules/${ruleFileName(row)}`,
    contents: renderRuleFile(row),
  }));
  return {
    provenance: normalized.map((row) => ({ id: row.id, level: row.level, title: row.title, slug: row.slug })),
    markdown,
    files,
  };
}

function compareRules(left: RuleRecord, right: RuleRecord): number {
  const byLevel = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
  if (byLevel !== 0) return byLevel;
  return left.title.localeCompare(right.title);
}

function yamlScalar(value: string): string {
  if (/[:#\n"]/.test(value) || value !== value.trim()) return JSON.stringify(value);
  return value;
}
