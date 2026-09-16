import { requireWorkspaceAccess } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const { user } = requireWorkspaceAccess(event, id, "view");
  return platform().mcpCatalog(id, user);
});
