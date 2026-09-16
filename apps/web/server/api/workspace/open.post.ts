import { requireUser } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const ws = await platform().warmForUser(user);
  const running = await platform().wakePreview(ws.id).catch(() => platform().requireWorkspace(ws.id));
  const session =
    platform().sessions(running.id)[0] ?? platform().createSession(running.id, platform().preferredProvider());
  platform().setPresence(running.id, user.id, "editor");
  return { workspace: running, session };
});
