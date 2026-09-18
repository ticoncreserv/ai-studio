import { requirePlatformAdmin, throwPlatformError } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const body = await readBody<{ login?: string; role?: string }>(event);
  const login = body?.login?.trim();
  if (!login) throw createError({ statusCode: 400, statusMessage: "login required" });
  try {
    return {
      member: platform().addWorkspaceMember(actor, getRouterParam(event, "id")!, { login, role: body?.role }),
    };
  } catch (error) {
    throwPlatformError(error);
  }
});
