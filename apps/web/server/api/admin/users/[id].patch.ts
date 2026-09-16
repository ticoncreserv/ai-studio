import { requirePlatformAdmin } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  const body = await readBody<{ platformAdmin?: boolean; disabled?: boolean; destroyWorkspace?: boolean }>(event);
  const hasAdmin = typeof body.platformAdmin === "boolean";
  const hasDisabled = typeof body.disabled === "boolean";
  if (!hasAdmin && !hasDisabled) {
    throw createError({ statusCode: 400, statusMessage: "platformAdmin or disabled required" });
  }
  try {
    let user;
    if (hasAdmin) user = platform().setPlatformAdmin(actor, id, body.platformAdmin!);
    if (hasDisabled) {
      user = await platform().setUserDisabled(actor, id, body.disabled!, {
        destroyWorkspace: body.destroyWorkspace === true,
      });
    }
    return { user };
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    const statusCode = message === "User not found" ? 404 : message === "Forbidden" ? 403 : 400;
    throw createError({ statusCode, statusMessage: message, message, data: { message } });
  }
});
