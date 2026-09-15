import { foldEvents } from "@atelier/domain";
import { platform, userFromEvent } from "../../utils/platform";

export default defineEventHandler((event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const id = getRouterParam(event, "id")!;
  const workspace = platform().requireWorkspace(id);
  const sessions = platform().sessions(id, getQuery(event).q?.toString());
  const sessionId = getQuery(event).session?.toString() ?? sessions[0]?.id;
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  return {
    workspace,
    sessions,
    session,
    snapshot: session ? foldEvents(session.events) : null,
    events: session?.events ?? [],
    flags: platform().flags(),
    mentions: platform().mentionIndex(),
    recipes: platform().store.read().recipes,
    connections: platform().store.read().connections,
    presence: platform().store.read().presence.filter((p) => p.workspaceId === id),
    lock: platform().store.read().runLock[id] ?? null,
    env: platform().envPreview(id),
    divergence: {
      pendingInBranch: ["2026_04_01_add_quote_window"],
      extraInDatabase: [],
    },
    previewPath: `/-/p/${workspace.previewToken}/`,
  };
});
