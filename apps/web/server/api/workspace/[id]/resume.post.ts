import { requireWorkspaceAccess } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  requireWorkspaceAccess(event, id, "view");
  const workspace = await platform().wakePreview(id);
  return { workspace };
});
