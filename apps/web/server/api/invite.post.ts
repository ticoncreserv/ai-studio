import { requireInvite, throwPlatformError } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId?: string; role?: string }>(event);
  const workspaceId = body?.workspaceId?.trim();
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: "workspace required" });
  const user = requireInvite(event, workspaceId);
  try {
    return platform().createInvite(user, { workspaceId, role: body?.role });
  } catch (error) {
    throwPlatformError(error);
  }
});
