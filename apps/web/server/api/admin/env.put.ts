import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const body = await readBody<{ env?: Record<string, string>; raw?: string; apply?: boolean }>(event);
  const saved = platform().saveGlobalEnv(body);
  if (body.apply) platform().applyEnvToWorktrees();
  return saved;
});
