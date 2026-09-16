import { requireUser, requireWorkspaceAccess } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<{
    rules: Array<{ id: string; level: "platform" | "project" | "user"; title: string; body: string }>;
    workspaceId?: string;
  }>(event);
  if (!body.rules?.length) throw createError({ statusCode: 400 });
  if (body.workspaceId) requireWorkspaceAccess(event, body.workspaceId, "edit");
  const worktree = body.workspaceId ? platform().requireWorkspace(body.workspaceId).worktree : undefined;
  return { rules: platform().saveRulesFromActor(user, body.rules, user.locale, worktree) };
});
