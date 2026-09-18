import { throwPlatformError } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  try {
    return platform().invitePreview(getRouterParam(event, "token")!);
  } catch (error) {
    throwPlatformError(error);
  }
});
