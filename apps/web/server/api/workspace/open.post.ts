import { requireUser } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const ws = await platform().warmForUser(user);
  const session = platform().sessions(ws.id)[0] ?? platform().createSession(ws.id, platform().preferredProvider());
  platform().setPresence(ws.id, user.id, "editor");
  return { workspace: ws, session };
});
