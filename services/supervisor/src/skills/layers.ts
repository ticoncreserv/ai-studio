import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  isSkillName,
  parseSkillFile,
  renderSkillFile,
  skillCatalog,
  skillFromParsed,
  type SkillDefinition,
} from "@atelier/domain";
import { manifestPath, readSkillsManifest, scanWorktreeSkills, type SkillsManifest } from "./catalog.js";

export interface SkillPrefs {
  userId: string;
  name: string;
  enabled: boolean;
}

const DEFAULT_PLATFORM_SKILLS: Array<{ name: string; description: string; body: string }> = [
  {
    name: "inertia-crud",
    description: "Creates an Inertia Vue page that lists, creates, and edits a Laravel model. Use when the user wants CRUD for a model.",
    body: "Create an Inertia Vue page that lists, creates, and edits the model named in the rest of the prompt. Follow existing Pages conventions. Write code in English.",
  },
  {
    name: "add-field",
    description: "Adds a model field across the migration, model, Form Request, and Inertia form. Use when the user wants a new column or attribute.",
    body: "Add the field named in the rest of the prompt across the migration, model, Form Request, and Inertia form. Do not run migrate:fresh.",
  },
  {
    name: "fix-preview",
    description: "Investigates the latest preview or runtime error and fixes it with a small, reviewable diff.",
    body: "Investigate the latest preview/runtime error and fix it with a small, reviewable diff.",
  },
];

export function skillsRoot(storeDir: string): string {
  return join(storeDir, "skills");
}

export function globalSkillsDir(storeDir: string): string {
  return join(skillsRoot(storeDir), "global");
}

export function userSkillsDir(storeDir: string, userId: string): string {
  return join(skillsRoot(storeDir), "users", userId);
}

export function readLayerSkills(dir: string, source: "platform" | "user"): SkillDefinition[] {
  if (!existsSync(dir)) return [];
  const out: SkillDefinition[] = [];
  for (const name of readdirSync(dir)) {
    const skillDir = join(dir, name);
    try {
      if (!statSync(skillDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const file = join(skillDir, "SKILL.md");
    if (!existsSync(file)) continue;
    const parsed = parseSkillFile(readFileSync(file, "utf8"));
    out.push(
      skillFromParsed({
        folder: name,
        dir: `${source}/${name}`,
        source,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      }),
    );
  }
  return out;
}

export function seedGlobalSkills(storeDir: string): SkillDefinition[] {
  const dir = globalSkillsDir(storeDir);
  mkdirSync(dir, { recursive: true });
  const existing = readLayerSkills(dir, "platform");
  if (existing.length) return existing;
  for (const skill of DEFAULT_PLATFORM_SKILLS) {
    writeSkillFile(dir, {
      name: skill.name,
      description: skill.description,
      body: skill.body,
      paths: [],
      manualOnly: true,
    });
  }
  return readLayerSkills(dir, "platform");
}

export function writeSkillFile(
  root: string,
  skill: { name: string; description: string; body: string; paths?: string[]; manualOnly?: boolean },
): string {
  if (!isSkillName(skill.name)) throw new Error("Invalid skill name");
  const dir = join(root, skill.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    renderSkillFile(
      {
        name: skill.name,
        description: skill.description,
        paths: skill.paths ?? [],
        manualOnly: skill.manualOnly ?? true,
      },
      skill.body,
    ),
  );
  return dir;
}

export function deleteSkillFile(root: string, name: string): void {
  if (!isSkillName(name)) throw new Error("Invalid skill name");
  rmSync(join(root, name), { recursive: true, force: true });
}

export function collectSkills(input: {
  worktree: string;
  storeDir: string;
  userId?: string;
}): { skills: SkillDefinition[]; shadowed: SkillDefinition[] } {
  const repo = scanWorktreeSkills(input.worktree);
  const platform = seedGlobalSkills(input.storeDir);
  const user = input.userId ? readLayerSkills(userSkillsDir(input.storeDir, input.userId), "user") : [];
  return skillCatalog([...repo, ...user, ...platform]);
}

export function materializeSkills(input: {
  worktree: string;
  storeDir: string;
  userId?: string;
  prefs?: SkillPrefs[];
}): { written: SkillsManifest["written"]; skills: SkillDefinition[] } {
  const { skills } = collectSkills(input);
  const prefs = new Map(
    (input.prefs ?? []).filter((row) => !input.userId || row.userId === input.userId).map((row) => [row.name, row.enabled]),
  );
  const previous = readSkillsManifest(input.worktree);
  for (const row of previous.written) {
    rmSync(join(input.worktree, row.path), { recursive: true, force: true });
  }
  const written: SkillsManifest["written"] = [];
  for (const skill of skills) {
    if (skill.source === "repo") continue;
    if (prefs.get(skill.name) === false) continue;
    const rel = `.cursor/skills/${skill.name}`;
    mkdirSync(join(input.worktree, rel), { recursive: true });
    writeFileSync(join(input.worktree, rel, "SKILL.md"), renderSkillFile(skill, skill.body));
    written.push({ name: skill.name, source: skill.source, path: rel });
  }
  mkdirSync(dirname(manifestPath(input.worktree)), { recursive: true });
  writeFileSync(manifestPath(input.worktree), JSON.stringify({ written }, null, 2));
  return { written, skills };
}

export function skillEnabled(name: string, prefs: SkillPrefs[], userId: string): boolean {
  const row = prefs.find((item) => item.userId === userId && item.name === name);
  return row ? row.enabled : true;
}
