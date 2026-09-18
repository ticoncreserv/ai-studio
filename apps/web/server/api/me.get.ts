import { requireUser } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event, { allowDisabled: true });
  const access = platform().listAccessibleWorkspaces(user);
  const ws = platform().store.read().workspaces.find((w) => w.userId === user.id && w.status !== "destroyed");
  return {
    user: { ...user, platformAdmin: platform().isPlatformAdmin(user), disabled: Boolean(user.disabled) },
    workspace: ws ?? null,
    sessions: ws ? platform().sessions(ws.id).slice(0, 6) : [],
    memberships: access.memberships,
    flags: platform().flags(),
    providers: platform().listProviders(),
    mentions: ws ? await platform().mentionIndex(ws.id) : { routes: [], models: [], pages: [] },
    connections: ws ? platform().workspaceConnections(ws.id) : [],
    recipes: platform().store.read().recipes,
    agent: platform().agentStatus(),
  };
});
