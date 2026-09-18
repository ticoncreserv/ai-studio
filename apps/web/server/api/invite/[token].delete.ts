import { requireUser, throwPlatformError } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  const user = requireUser(event);
  try {
    return platform().revokeInvite(user, getRouterParam(event, "token")!);
  } catch (error) {
    throwPlatformError(error);
  }
});
