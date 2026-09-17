import type { ProviderId } from "@atelier/contracts";
import { requireWorkspaceAccess } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId: string; provider?: ProviderId }>(event);
  requireWorkspaceAccess(event, body.workspaceId, "edit");
  return platform().createSession(body.workspaceId, body.provider ?? platform().preferredProvider());
});
