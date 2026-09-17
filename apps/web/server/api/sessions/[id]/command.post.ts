import { ClientCommandSchema } from "@atelier/contracts";
import { UsageLimitError } from "@atelier/supervisor";
import { requireUser } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const sessionId = getRouterParam(event, "id")!;
  const session = platform().store.read().sessions.find((row) => row.id === sessionId);
  if (!session) throw createError({ statusCode: 404, statusMessage: "session not found" });
  try {
    platform().assertWorkspaceAccess(user, session.workspaceId, "view");
  } catch {
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
  const body = await readBody<{ command: unknown }>(event);
  const command = ClientCommandSchema.parse(body.command);
  try {
    await platform().handleCommand({ user, sessionId, command });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      throw createError({
        statusCode: 429,
        statusMessage: "usage limit",
        message: error.message,
        data: { usageLimit: true, usage: error.summary, snapshot: platform().snapshot(sessionId) },
      });
    }
    throw error;
  }
  return { ok: true, snapshot: platform().snapshot(sessionId) };
});
