import { platform, userFromEvent } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const body = await readBody<{ workspaceId: string; provider?: "mock" | "cursor" }>(event);
  return platform().createSession(body.workspaceId, body.provider ?? platform().preferredProvider());
});
