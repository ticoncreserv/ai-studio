import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler((event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  try {
    const workspace = platform().clearWorkspaceError(id);
    return { ok: true, workspace };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clear failed";
    throw createError({ statusCode: /not found/i.test(message) ? 404 : 500, statusMessage: message });
  }
});
