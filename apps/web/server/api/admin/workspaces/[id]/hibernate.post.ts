import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  await platform().adminHibernate(id);
  return { ok: true };
});
