import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  requirePlatformAdmin(event);
  const key = getQuery(event).reveal?.toString();
  if (key) return { key, value: platform().revealGlobalEnvKey(key) };
  return platform().getGlobalEnv();
});
