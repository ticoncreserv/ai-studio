import type { FeatureFlag } from "@atelier/contracts";

export const defaultFlags: Record<FeatureFlag, boolean> = {
  publish: false,
  multiProvider: false,
  spectator: true,
  recipes: true,
  skills: true,
  mcp: true,
  secureWebSocket: true,
  safeUploads: true,
  sandboxedAgent: true,
  transactionalReview: true,
  validationGate: true,
  autoPush: false,
  workspaceQueue: true,
  realProviderEvals: false,
  sandboxRequired: false,
  postgresStore: false,
  postgresShadowRead: false,
  claudeProvider: false,
  geminiProvider: false,
  grokProvider: false,
  providerCanary: false,
};

export function isFlagOn(flags: Record<string, boolean>, flag: FeatureFlag): boolean {
  return Boolean(flags[flag]);
}
