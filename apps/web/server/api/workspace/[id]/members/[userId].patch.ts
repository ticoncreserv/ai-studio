import { requireUser, throwPlatformError } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<{ role?: string }>(event);
  try {
    return platform().setWorkspaceMemberRole(
      user,
      getRouterParam(event, "id")!,
      getRouterParam(event, "userId")!,
      body?.role ?? "",
    );
  } catch (error) {
    throwPlatformError(error);
  }
});
