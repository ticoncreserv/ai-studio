import { requirePlatformAdmin } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  const body = await readBody<{
    platformAdmin?: boolean;
    disabled?: boolean;
    destroyWorkspace?: boolean;
    usageProfileId?: string;
  }>(event);
  const hasAdmin = typeof body.platformAdmin === "boolean";
  const hasDisabled = typeof body.disabled === "boolean";
  const hasProfile = typeof body.usageProfileId === "string" && body.usageProfileId.length > 0;
  if (!hasAdmin && !hasDisabled && !hasProfile) {
    throw createError({ statusCode: 400, statusMessage: "platformAdmin, disabled, or usageProfileId required" });
  }
  try {
    let user;
    let usage;
    if (hasAdmin) user = platform().setPlatformAdmin(actor, id, body.platformAdmin!);
    if (hasDisabled) {
      user = await platform().setUserDisabled(actor, id, body.disabled!, {
        destroyWorkspace: body.destroyWorkspace === true,
      });
    }
    if (hasProfile) {
      usage = platform().setUserUsageProfile(actor, id, body.usageProfileId!);
      user = platform().listUsers().find((row) => row.id === id);
    }
    return { user, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    const statusCode = message === "User not found" || message === "Profile not found" ? 404 : message === "Forbidden" ? 403 : 400;
    throw createError({ statusCode, statusMessage: message, message, data: { message } });
  }
});
