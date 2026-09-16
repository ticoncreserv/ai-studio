import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanWorktreeSkills } from "./catalog.js";
import { collectSkills, materializeSkills, seedGlobalSkills, writeSkillFile, userSkillsDir } from "./layers.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function worktree(): string {
  const dir = mkdtempSync(join(tmpdir(), "atelier-skills-"));
  dirs.push(dir);
  return dir;
}

function writeSkill(root: string, name: string, extra = "") {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(
    join(root, name, "SKILL.md"),
    `---
name: ${name}
description: Skill ${name} for tests.
${extra}---

Instructions for ${name}.
`,
  );
}

describe("skill catalog", () => {
  it("discovers repo, nested, and compatibility directories", () => {
    const dir = worktree();
    writeSkill(join(dir, ".agents", "skills"), "land-it");
    writeSkill(join(dir, ".claude", "skills", "shipping"), "careful-merge");
    writeSkill(join(dir, "apps", "web", ".cursor", "skills"), "deploy-web");
    const found = scanWorktreeSkills(dir);
    expect(found.map((row) => row.name).sort()).toEqual(["careful-merge", "deploy-web", "land-it"]);
    expect(found.find((row) => row.name === "deploy-web")?.scope).toBe("apps/web");
  });

  it("lets a repository skill shadow the platform seed", () => {
    const dir = worktree();
    const storeDir = worktree();
    writeSkill(join(dir, ".agents", "skills"), "inertia-crud");
    const { skills, shadowed } = collectSkills({ worktree: dir, storeDir });
    expect(skills.find((row) => row.name === "inertia-crud")?.source).toBe("repo");
    expect(shadowed.some((row) => row.name === "inertia-crud" && row.source === "platform")).toBe(true);
  });

  it("materializes user skills into gitignored .cursor/skills", () => {
    const dir = worktree();
    const storeDir = worktree();
    seedGlobalSkills(storeDir);
    writeSkillFile(userSkillsDir(storeDir, "user-1"), {
      name: "my-review",
      description: "Reviews the current diff.",
      body: "Review the diff.",
      manualOnly: true,
    });
    const { written } = materializeSkills({ worktree: dir, storeDir, userId: "user-1" });
    expect(written.some((row) => row.name === "my-review" && row.source === "user")).toBe(true);
    const scanned = scanWorktreeSkills(dir);
    expect(scanned.find((row) => row.name === "my-review")?.source).toBe("user");
  });
});
