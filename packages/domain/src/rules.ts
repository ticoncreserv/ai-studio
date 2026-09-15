export interface RuleLayer {
  id: string;
  level: "platform" | "project" | "user";
  title: string;
  body: string;
}

export interface CompiledRules {
  provenance: Array<{ id: string; level: string; title: string }>;
  markdown: string;
  files: Array<{ path: string; contents: string }>;
}

export function compileRules(layers: RuleLayer[], locale: "en" | "pt-BR"): CompiledRules {
  const provenance = layers.map((l) => ({ id: l.id, level: l.level, title: l.title }));
  const languageRule =
    locale === "pt-BR"
      ? "Reply to the user in Brazilian Portuguese. Write all code, identifiers, comments, and commit messages in English."
      : "Reply to the user in English. Write all code, identifiers, comments, and commit messages in English.";

  const workaroundRule =
    "Do not remove or refactor code that has an explanatory workaround comment unless the user explicitly asks.";

  const markdown = [
    "# Agent instructions",
    "",
    languageRule,
    "",
    workaroundRule,
    "",
    ...layers.map((l) => `## ${l.level}: ${l.title}\n\n${l.body}`),
  ].join("\n");

  const files = [
    { path: "AGENTS.md", contents: markdown },
    ...layers.map((l) => ({
      path: `.cursor/rules/${l.level}-${l.id}.mdc`,
      contents: `---\ndescription: ${l.title}\n---\n\n${l.body}\n`,
    })),
  ];

  return { provenance, markdown, files };
}
