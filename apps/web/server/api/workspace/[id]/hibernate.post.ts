import { requireWorkspaceManage } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  requireWorkspaceManage(event, id);
  await platform().hibernate(id, { byUser: true });
  return { ok: true };
});
