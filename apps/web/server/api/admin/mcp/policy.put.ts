import { requirePlatformAdmin } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requirePlatformAdmin(event);
  const body = await readBody<{ allowUserServers?: boolean; allowedCommands?: string[]; allowedUrlPatterns?: string[] }>(event);
  return { policy: platform().saveMcpPolicy(user, body ?? {}) };
});
