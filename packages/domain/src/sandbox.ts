import type { FeatureFlag, SandboxProfile } from "@atelier/contracts";
import { isFlagOn } from "./flags.js";

export function resolveSandboxProfile(
  flags: Record<string, boolean>,
  env: Record<string, string | undefined> = process.env,
): SandboxProfile {
  const forced = env.ATELIER_SANDBOX_PROFILE?.trim();
  if (forced === "disabled" || forced === "best-effort" || forced === "required") return forced;
  if (!isFlagOn(flags, "sandboxedAgent" as FeatureFlag)) return "disabled";
  if (isFlagOn(flags, "sandboxRequired" as FeatureFlag)) return "required";
  return "best-effort";
}
