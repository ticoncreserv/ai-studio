import { platform, userFromEvent } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const ws = await platform().warmForUser(user);
  const running = await platform().startPreview(ws.id);
  const session =
    platform().sessions(running.id)[0] ?? platform().createSession(running.id, "mock");
  platform().setPresence(running.id, user.id, "editor");
  return { workspace: running, session };
});
