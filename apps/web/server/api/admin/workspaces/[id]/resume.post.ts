import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  try {
    const workspace = await platform().adminResume(id);
    return { ok: true, workspace };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resume failed";
    throw createError({
      statusCode: /not found/i.test(message) ? 404 : 500,
      statusMessage: message,
      message,
      data: { message },
    });
  }
});
