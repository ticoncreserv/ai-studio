import { requirePlatformAdmin, throwPlatformError } from "../../../../../utils/authz";
import { platform } from "../../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const body = await readBody<{ role?: string }>(event);
  try {
    return {
      member: platform().setWorkspaceMemberRole(
        actor,
        getRouterParam(event, "id")!,
        getRouterParam(event, "userId")!,
        body?.role ?? "",
      ),
    };
  } catch (error) {
    throwPlatformError(error);
  }
});
