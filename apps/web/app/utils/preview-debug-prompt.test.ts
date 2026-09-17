import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import ptBR from "../../i18n/locales/pt-BR.json";
import {
  formatPreviewDebugPrompt,
  formatSlowRequestPrompt,
  isSlowPreviewRequest,
  previewDebugCommand,
  previewFixCommand,
  type PreviewDebugTranslate,
} from "./preview-debug-prompt";

function tOf(locale: typeof en): PreviewDebugTranslate {
  return (key, values) => {
    const found = key
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale);
    let text = typeof found === "string" ? found : key;
    for (const [name, value] of Object.entries(values ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  };
}

const tEn = tOf(en);
const tPt = tOf(ptBR);

describe("formatPreviewDebugPrompt", () => {
  it("asks the agent to investigate duplicate queries with the snapshot", () => {
    expect(
      formatPreviewDebugPrompt(
        {
          uri: "/login",
          timeMs: 80,
          queries: 12,
          memoryMb: 28,
          nPlusOne: true,
          duplicates: [{ sql: "select * from users where id = ?", count: 8 }],
        },
        tEn,
      ),
    ).toContain("8× select * from users where id = ?");
  });

  it("writes the prompt in the active UI locale", () => {
    const debug = { uri: "/login", timeMs: 900, queries: 40, nPlusOne: true };
    const english = formatSlowRequestPrompt(debug, tEn);
    const portuguese = formatSlowRequestPrompt(debug, tPt);
    expect(english).toContain("expensive");
    expect(english).toContain("Time: 900 ms");
    expect(english).toContain("N+1: yes");
    expect(portuguese).toContain("parece cara");
    expect(portuguese).toContain("Tempo: 900 ms");
    expect(portuguese).toContain("N+1: sim");
    expect(portuguese).toContain("Consultas: 40");
  });
});

describe("previewFixCommand", () => {
  it("sends fix_error when a runtime error exists", () => {
    expect(previewFixCommand({ nPlusOne: true }, tEn, "err-1")).toEqual({ type: "fix_error", eventId: "err-1" });
  });

  it("sends a prompt with the metrics snapshot otherwise", () => {
    const command = previewFixCommand({ uri: "/login", nPlusOne: true, queries: 12 }, tEn);
    expect(command.type).toBe("prompt");
    if (command.type === "prompt") {
      expect(command.text).toContain("/login");
      expect(command.text).toContain("Queries: 12");
    }
  });
});

describe("previewDebugCommand", () => {
  it("asks about one SQL", () => {
    const command = previewDebugCommand("query", { uri: "/checklists" }, tEn, undefined, "select 1");
    expect(command.type).toBe("prompt");
    if (command.type === "prompt") expect(command.text).toContain("SQL: select 1");
  });

  it("asks about a slow request in Portuguese when the UI is pt-BR", () => {
    const command = previewDebugCommand("slow", { timeMs: 900, queries: 40 }, tPt);
    expect(command.type).toBe("prompt");
    if (command.type === "prompt") {
      expect(command.text).toContain("parece cara");
      expect(command.text).toContain("Tempo: 900 ms");
    }
    expect(isSlowPreviewRequest({ timeMs: 900 })).toBe(true);
    expect(isSlowPreviewRequest({ queries: 4, timeMs: 40 })).toBe(false);
  });
});
