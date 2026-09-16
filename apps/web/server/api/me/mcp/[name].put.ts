import { requireUser } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const name = getRouterParam(event, "name")!;
  const body = await readBody<unknown>(event);
  try {
    return { servers: platform().upsertUserMcp(user, name, body ?? {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    throw createError({ statusCode: message.includes("not allowed") ? 403 : 400, statusMessage: message });
  }
});
