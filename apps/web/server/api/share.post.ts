import { requireWorkspaceAccess } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId: string }>(event);
  requireWorkspaceAccess(event, body.workspaceId, "edit");
  return platform().sharePreview(body.workspaceId);
});
