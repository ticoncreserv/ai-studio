import { platform, userFromEvent } from "../utils/platform";

export default defineEventHandler((event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "unauthorized" });
  const ws = platform().store.read().workspaces.find((w) => w.userId === user.id && w.status !== "destroyed");
  return {
    user,
    workspace: ws ?? null,
    flags: platform().flags(),
    providers: platform().listProviders(),
    mentions: platform().mentionIndex(),
    connections: platform().store.read().connections,
    recipes: platform().store.read().recipes,
  };
});
