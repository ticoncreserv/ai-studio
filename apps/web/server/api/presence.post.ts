import { requireWorkspaceAccess } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId: string; mode: "editor" | "spectator" }>(event);
  const { user } = requireWorkspaceAccess(event, body.workspaceId, body.mode === "editor" ? "edit" : "view");
  platform().setPresence(body.workspaceId, user.id, body.mode);
  return { ok: true };
});
