import { describe, expect, it } from "vitest";
import {
  compileRules,
  DEFAULT_RULES,
  isLegacyUserRule,
  isRuleSlug,
  normalizeRule,
  ruleFileName,
  rulesForActor,
  slugifyRuleTitle,
  storedRules,
} from "./rules.js";

const ana = normalizeRule({
  id: "ana-pref",
  level: "user",
  title: "Small diffs",
  description: "Prefer small reviewable diffs.",
  slug: "small-diffs",
  body: "Prefer small, reviewable diffs.",
  userId: "ana",
  alwaysApply: true,
});

const bruno = normalizeRule({
  id: "bruno-pref",
  level: "user",
  title: "Verbose logs",
  slug: "verbose-logs",
  body: "Explain every file change.",
  userId: "bruno",
  alwaysApply: true,
});

const requestable = normalizeRule({
  id: "ana-style",
  level: "user",
  title: "Commit style",
  slug: "commit-style",
  body: "Use conventional commits.",
  userId: "ana",
  alwaysApply: false,
});

describe("rules", () => {
  it("slugifies titles and rejects invalid slugs", () => {
    expect(slugifyRuleTitle("Workaround comments")).toBe("workaround-comments");
    expect(isRuleSlug("english-code")).toBe(true);
    expect(isRuleSlug("English Code")).toBe(false);
    expect(isRuleSlug("a--b")).toBe(false);
  });

  it("drops legacy user blobs without a userId", () => {
    const legacy = { id: "user", level: "user" as const, title: "User", body: "Shared", description: "User", slug: "user", alwaysApply: true };
    expect(isLegacyUserRule(legacy)).toBe(true);
    expect(storedRules([...DEFAULT_RULES, legacy, ana]).map((row) => row.id)).not.toContain("user");
  });

  it("isolates user rules per actor", () => {
    const all = [...DEFAULT_RULES, ana, bruno];
    expect(rulesForActor(all, "ana").filter((row) => row.level === "user").map((row) => row.id)).toEqual(["ana-pref"]);
    expect(rulesForActor(all, "bruno").filter((row) => row.level === "user").map((row) => row.id)).toEqual(["bruno-pref"]);
    expect(rulesForActor(all, "ana").every((row) => row.level !== "user" || row.userId === "ana")).toBe(true);
  });

  it("compiles always-apply markdown and one mdc per rule without AGENTS.md", () => {
    const compiled = compileRules([...DEFAULT_RULES, ana, requestable], "en");
    expect(compiled.files.some((file) => file.path === "AGENTS.md")).toBe(false);
    expect(compiled.markdown).toContain("Reply to the user in English");
    expect(compiled.markdown).toContain("## Safety");
    expect(compiled.markdown).toContain("## Small diffs");
    expect(compiled.markdown).not.toContain("Use conventional commits.");
    expect(compiled.markdown).not.toContain("Explain every file change.");
    const paths = compiled.files.map((file) => file.path);
    expect(paths).toContain(".cursor/rules/platform-safety.mdc");
    expect(paths).toContain(".cursor/rules/user-small-diffs.mdc");
    expect(paths).toContain(".cursor/rules/user-commit-style.mdc");
    expect(paths).toContain(".cursor/rules/platform-workaround-comments.mdc");
    const commitFile = compiled.files.find((file) => file.path.endsWith("user-commit-style.mdc"));
    expect(commitFile?.contents).toContain("alwaysApply: false");
    expect(ruleFileName(ana)).toBe("user-small-diffs.mdc");
  });

  it("injects Brazilian Portuguese as the reply language", () => {
    const compiled = compileRules(DEFAULT_RULES, "pt-BR");
    expect(compiled.markdown).toContain("Reply to the user in Brazilian Portuguese");
    expect(compiled.markdown).toContain("Write all code, identifiers, comments, and commit messages in English");
  });
});
