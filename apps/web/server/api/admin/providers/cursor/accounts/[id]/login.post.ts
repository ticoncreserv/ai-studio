import { requirePlatformAdmin } from "../../../../../../utils/authz";
import { platform } from "../../../../../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  if (!id) throw createError({ statusCode: 400, statusMessage: "id required" });
  try {
    return await platform().startCursorCliLogin(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "login failed";
    const statusCode = /already signing in/i.test(message) ? 409 : /unknown/i.test(message) ? 404 : 400;
    throw createError({ statusCode, statusMessage: message, message, data: { message } });
  }
});
