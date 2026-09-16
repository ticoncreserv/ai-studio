import { requirePlatformAdmin } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const body = await readBody<Record<string, boolean>>(event);
  return platform().saveFlags(body);
});
