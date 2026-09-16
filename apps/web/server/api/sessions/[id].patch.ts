import type { ProviderId } from "@atelier/contracts";
import { requireUser } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const session = platform().store.read().sessions.find((row) => row.id === getRouterParam(event, "id"));
  if (!session) throw createError({ statusCode: 404 });
  try {
    platform().assertWorkspaceAccess(user, session.workspaceId, "edit");
  } catch {
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
  const body = await readBody<{ provider: ProviderId }>(event);
  return platform().setSessionProvider(session.id, body.provider);
});
