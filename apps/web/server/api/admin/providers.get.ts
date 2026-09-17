import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  await platform().syncCursorCliLogin();
  return { providers: platform().getProviderSettings() };
});
