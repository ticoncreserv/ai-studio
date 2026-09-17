import { requirePlatformAdmin } from "../../../../../../utils/authz";
import { platform } from "../../../../../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  if (!id) throw createError({ statusCode: 400, statusMessage: "id required" });
  try {
    await platform().signOutCursorCli(id);
    return { providers: platform().getProviderSettings() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "logout failed";
    const statusCode = /unknown/i.test(message) ? 404 : 400;
    throw createError({ statusCode, statusMessage: message, message, data: { message } });
  }
});
