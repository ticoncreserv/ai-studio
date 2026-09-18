import { requireUser, throwPlatformError } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler((event) => {
  const user = requireUser(event);
  try {
    return platform().removeWorkspaceMember(user, getRouterParam(event, "id")!, getRouterParam(event, "userId")!);
  } catch (error) {
    throwPlatformError(error);
  }
});
