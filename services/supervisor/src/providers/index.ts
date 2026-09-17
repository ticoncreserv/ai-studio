import type { ProviderId } from "@atelier/contracts";
import { CursorProvider } from "./cursor.js";
import { ClaudeProvider } from "./claude.js";
import { GeminiProvider } from "./gemini.js";
import { GrokProvider } from "./grok.js";
import { MockProvider } from "./mock.js";
import type { AgentProvider } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";

export { PROVIDER_CATALOG, MockProvider, CursorProvider, ClaudeProvider, GeminiProvider, GrokProvider };
export type { AgentProvider } from "./types.js";

export function createProvider(id: ProviderId): AgentProvider {
  if (id === "cursor") return new CursorProvider();
  if (id === "claude") return new ClaudeProvider();
  if (id === "gemini") return new GeminiProvider();
  if (id === "grok") return new GrokProvider();
  if (id === "mock" && process.env.VITEST) return new MockProvider();
  if (id === "mock") throw new Error("MockProvider is only available in tests. Set CURSOR_API_KEY.");
  throw new Error(`Provider ${id} is not available`);
}

export function listProviders() {
  if (process.env.VITEST) return PROVIDER_CATALOG;
  return PROVIDER_CATALOG.filter((provider) => provider.id !== "mock");
}
