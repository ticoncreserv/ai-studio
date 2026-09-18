import { foldEvents } from "@atelier/domain";
import { requireWorkspaceAccess } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const { user, workspace } = requireWorkspaceAccess(event, id, "view");
  const sessions = platform().sessions(id, getQuery(event).q?.toString());
  const sessionId = getQuery(event).session?.toString() ?? sessions[0]?.id;
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  const db = platform().store.read();
  const quota = await platform().workspaceQuota(id);
  const mentions = await platform().mentionIndex(id);
  const canEditWorkspace = platform().canAccessWorkspace(user, workspace, "edit");
  return {
    user: { ...user, platformAdmin: platform().isPlatformAdmin(user) },
    workspace: {
      ...workspace,
      previewProcessRunning: Boolean(workspace.port && platform().runtime.isRunning(id)),
    },
    sessions,
    session,
    snapshot: session ? foldEvents(session.events) : null,
    events: session?.events ?? [],
    flags: platform().flags(),
    mentions,
    recipes: db.recipes,
    connections: platform().workspaceConnections(id),
    rules: platform().studioRules(user, workspace.worktree),
    providers: platform().listProviders(),
    preferredProvider: platform().preferredProvider(),
    presence: db.presence.filter((p) => p.workspaceId === id),
    lock: db.runLock[id] ?? null,
    env: platform().envPreview(id),
    userEnv: platform().getUserEnv(user.id),
    worktreeEnvPath: `var/workspaces/${id}/.env`,
    divergence: platform().workspaceDivergence(id),
    quota,
    usage: platform().usageSummary(user.id),
    migrationLog: db.migrationLog,
    previewPath: `/-/p/${workspace.previewToken}/`,
    canEdit: canEditWorkspace,
    canInvite: platform().canCreateInvite(user),
    agent: platform().agentStatus(),
    skills: platform().skillCatalog(id, user).skills,
    mcp: platform().mcpCatalog(id, user),
  };
});
