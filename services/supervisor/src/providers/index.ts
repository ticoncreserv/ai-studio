import type { ProviderId } from "@atelier/contracts";
import { CursorProvider } from "./cursor.js";
import { MockProvider } from "./mock.js";
import type { AgentProvider } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";

export { PROVIDER_CATALOG, MockProvider, CursorProvider };
export type { AgentProvider } from "./types.js";

export function createProvider(id: ProviderId): AgentProvider {
  if (id === "cursor") return new CursorProvider();
  return new MockProvider();
}

export function listProviders() {
  return PROVIDER_CATALOG;
}
