export const ADMIN_SECTIONS = [
  "overview",
  "errors",
  "env",
  "providers",
  "users",
  "usage",
  "workspaces",
  "rules",
  "recipes",
  "skills",
  "mcp",
  "flags",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

const SECTION_SET = new Set<string>(ADMIN_SECTIONS);

export function parseAdminSection(value: unknown): AdminSection {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "string" && SECTION_SET.has(raw)) return raw as AdminSection;
  return "overview";
}

export function adminSectionQuery(section: AdminSection): Record<string, string> {
  return section === "overview" ? {} : { tab: section };
}
