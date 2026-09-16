import { describe, expect, it } from "vitest";
import {
  isSkillName,
  parseSkillFile,
  renderSkillFile,
  skillCatalog,
  skillFromParsed,
  slashInvocation,
  slashMatches,
  slashQuery,
} from "./skills.js";

const sample = `---
name: land-it
description: Lands a pull request after checks pass.
paths:
  - "**/*.ts"
  - "packages/ui/**/*.tsx"
disable-model-invocation: true
metadata:
  author: atelier
---

# Land it

Follow the shipping checklist.
`;

describe("skills", () => {
  it("parses frontmatter lists, flags, and nested metadata", () => {
    const parsed = parseSkillFile(sample);
    expect(parsed.frontmatter.name).toBe("land-it");
    expect(parsed.frontmatter["disable-model-invocation"]).toBe(true);
    expect(parsed.frontmatter.paths).toEqual(["**/*.ts", "packages/ui/**/*.tsx"]);
    expect(parsed.frontmatter.metadata).toEqual({ author: "atelier" });
    expect(parsed.body).toContain("Follow the shipping checklist.");
    const skill = skillFromParsed({
      folder: "land-it",
      dir: ".cursor/skills/land-it",
      source: "repo",
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    });
    expect(skill.manualOnly).toBe(true);
    expect(skill.paths).toHaveLength(2);
    expect(skill.issues).toEqual([]);
  });

  it("accepts comma-separated paths and legacy globs", () => {
    const parsed = parseSkillFile(`---
name: python-style
description: Style rules for Python files.
paths: "**/*.py, scripts/**/*.py"
---
body
`);
    expect(skillFromParsed({
      folder: "python-style",
      dir: ".agents/skills/python-style",
      source: "repo",
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    }).paths).toEqual(["**/*.py", "scripts/**/*.py"]);
    const legacy = parseSkillFile(`---
name: python-style
description: Style rules for Python files.
globs: "**/*.py"
---
`);
    expect(skillFromParsed({
      folder: "python-style",
      dir: "x",
      source: "repo",
      frontmatter: parsed.frontmatter,
      body: "",
    }).paths.length).toBeGreaterThan(0);
    expect(legacy.frontmatter.globs).toBe("**/*.py");
  });

  it("flags name/folder mismatch and description length", () => {
    const parsed = parseSkillFile(`---
name: other
description: ${"x".repeat(1025)}
---
`);
    const issues = skillFromParsed({
      folder: "land-it",
      dir: "x",
      source: "user",
      frontmatter: parsed.frontmatter,
      body: "",
    }).issues.map((issue) => issue.code);
    expect(issues).toContain("name-folder");
    expect(issues).toContain("description-length");
  });

  it("prefers repository over user over platform", () => {
    const catalog = skillCatalog([
      { name: "land-it", description: "p", source: "platform", dir: "p", body: "", paths: [], manualOnly: false, issues: [] },
      { name: "land-it", description: "r", source: "repo", dir: "r", body: "", paths: [], manualOnly: false, issues: [] },
      { name: "land-it", description: "u", source: "user", dir: "u", body: "", paths: [], manualOnly: false, issues: [] },
    ]);
    expect(catalog.skills).toHaveLength(1);
    expect(catalog.skills[0]?.source).toBe("repo");
    expect(catalog.shadowed.map((row) => row.source).sort()).toEqual(["platform", "user"]);
  });

  it("parses slash queries only at the start of the prompt", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/lan")).toBe("lan");
    expect(slashQuery("/land-it extra")).toBeNull();
    expect(slashQuery("hello /land")).toBeNull();
    expect(slashInvocation("/land-it extra notes")).toBe("land-it");
    expect(slashInvocation("see /land-it")).toBeNull();
  });

  it("ranks manual-only slash matches first", () => {
    const hits = slashMatches(
      [
        { name: "review", description: "Review the diff", manualOnly: false },
        { name: "land-it", description: "Land a pull request", manualOnly: true },
        { name: "laravel-page", description: "Create an Inertia page", manualOnly: false },
      ],
      "la",
    );
    expect(hits[0]?.name).toBe("land-it");
    expect(hits.map((row) => row.name)).toContain("laravel-page");
  });

  it("round-trips a skill file and validates names", () => {
    expect(isSkillName("land-it")).toBe(true);
    expect(isSkillName("Land")).toBe(false);
    expect(isSkillName("-nope")).toBe(false);
    const rendered = renderSkillFile(
      { name: "land-it", description: "Lands a PR", paths: ["**/*.ts"], manualOnly: true },
      "Do the checklist.",
    );
    const parsed = parseSkillFile(rendered);
    expect(parsed.frontmatter.name).toBe("land-it");
    expect(parsed.body).toContain("Do the checklist.");
  });
});
