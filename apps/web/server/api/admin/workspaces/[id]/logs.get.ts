import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler((event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  try {
    return platform().getWorkspaceLogs(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logs unavailable";
    throw createError({ statusCode: /not found/i.test(message) ? 404 : 500, statusMessage: message });
  }
});
