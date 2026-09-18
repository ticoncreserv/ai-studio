import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  requirePlatformAdmin(event);
  return { rules: platform().listAdminRules() };
});
