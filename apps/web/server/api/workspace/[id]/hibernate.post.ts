import { requireWorkspaceAccess } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  requireWorkspaceAccess(event, id, "edit");
  await platform().hibernate(id, { byUser: true });
  return { ok: true };
});
