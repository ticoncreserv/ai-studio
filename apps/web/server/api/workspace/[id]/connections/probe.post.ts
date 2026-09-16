import { requireWorkspaceAccess } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  requireWorkspaceAccess(event, id, "view");
  return { probes: await platform().probeWorkspaceConnections(id) };
});
