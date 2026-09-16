import { platform, userFromEvent } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const body = await readBody<{ workspaceId: string; mode: "editor" | "spectator" }>(event);
  platform().setPresence(body.workspaceId, user.id, body.mode);
  return { ok: true };
});
