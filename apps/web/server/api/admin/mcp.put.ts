import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requirePlatformAdmin(event);
  const body = await readBody<{ mcpServers?: Record<string, unknown> }>(event);
  try {
    return { servers: platform().saveGlobalMcp(user, body), policy: platform().getMcpPolicy() };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "error" });
  }
});
