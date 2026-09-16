export interface MentionIndex {
  routes: string[];
  models: string[];
  pages: string[];
}

export interface PromptBlock {
  id: string;
  kind: "rules" | "mentions" | "attachments" | "errors" | "user";
  text: string;
  tokens: number;
  priority: number;
}

export interface PackedPrompt {
  text: string;
  omitted: string[];
  usedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function packPrompt(blocks: PromptBlock[], budget: number): PackedPrompt {
  const sorted = [...blocks].sort((a, b) => a.priority - b.priority);
  const kept: PromptBlock[] = [];
  const omitted: string[] = [];
  let used = 0;
  for (const block of sorted) {
    if (used + block.tokens <= budget) {
      kept.push(block);
      used += block.tokens;
    } else {
      omitted.push(`${block.kind}:${block.id}`);
    }
  }
  return {
    text: kept.map((b) => b.text).join("\n\n"),
    omitted,
    usedTokens: used,
  };
}

export function resolveMentions(query: string, index: MentionIndex): string[] {
  const q = query.toLowerCase();
  return [...index.routes, ...index.models, ...index.pages].filter((item) =>
    item.toLowerCase().includes(q),
  );
}

const PLAN_PROMPT_PREFIX = "Create a plan only. Do not edit files.\n\n";
const ASK_PROMPT_PREFIX = "Answer only. Do not edit files.\n\n";

export function promptPrefixForMode(mode?: string): string {
  if (mode === "plan") return PLAN_PROMPT_PREFIX;
  if (mode === "ask") return ASK_PROMPT_PREFIX;
  return "";
}

/** Mode instructions are for the agent only — never show them as the user's turn. */
export function visiblePromptText(text: string): string {
  if (text.startsWith(PLAN_PROMPT_PREFIX)) return text.slice(PLAN_PROMPT_PREFIX.length);
  if (text.startsWith(ASK_PROMPT_PREFIX)) return text.slice(ASK_PROMPT_PREFIX.length);
  return text;
}

export function titleFromPrompt(text: string): string {
  const cleaned = visiblePromptText(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled session";
  return cleaned.length > 64 ? `${cleaned.slice(0, 61)}...` : cleaned;
}

export function parseArtisanRouteList(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((row) => {
      if (row && typeof row === "object" && "uri" in row) {
        return String((row as { uri: unknown }).uri);
      }
      return "";
    })
    .filter(Boolean);
}
