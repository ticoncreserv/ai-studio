import type { FeatureFlag } from "@atelier/contracts";

export const defaultFlags: Record<FeatureFlag, boolean> = {
  publish: false,
  multiProvider: false,
  spectator: true,
  recipes: true,
  skills: true,
  mcp: true,
};

export function isFlagOn(flags: Record<string, boolean>, flag: FeatureFlag): boolean {
  return Boolean(flags[flag]);
}
