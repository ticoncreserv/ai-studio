import { requirePlatformAdmin, throwPlatformError } from "../../../../../utils/authz";
import { platform } from "../../../../../utils/platform";

export default defineEventHandler((event) => {
  const actor = requirePlatformAdmin(event);
  try {
    return platform().removeWorkspaceMember(actor, getRouterParam(event, "id")!, getRouterParam(event, "userId")!);
  } catch (error) {
    throwPlatformError(error);
  }
});
