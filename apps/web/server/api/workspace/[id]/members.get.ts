import { requireWorkspaceAccess } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler((event) => {
  const id = getRouterParam(event, "id")!;
  const { user, workspace } = requireWorkspaceAccess(event, id, "view");
  const manage = platform().canManageWorkspace(user, workspace);
  return {
    members: platform().listWorkspaceMembers(id),
    pendingInvites: manage ? platform().listWorkspaceInvites(id) : [],
    canManage: manage,
  };
});
