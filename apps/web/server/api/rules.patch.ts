import { platform, userFromEvent } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const body = await readBody<{
    rules: Array<{ id: string; level: "platform" | "project" | "user"; title: string; body: string }>;
    workspaceId?: string;
  }>(event);
  if (!body.rules?.length) throw createError({ statusCode: 400 });
  const worktree = body.workspaceId ? platform().requireWorkspace(body.workspaceId).worktree : undefined;
  platform().saveRules(body.rules, user.locale, worktree);
  return { rules: platform().getRules() };
});
