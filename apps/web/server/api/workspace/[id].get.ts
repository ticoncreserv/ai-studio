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
  const db = platform().store.read();
  return {
    user,
    workspace,
    sessions,
    session,
    snapshot: session ? foldEvents(session.events) : null,
    events: session?.events ?? [],
    flags: platform().flags(),
    mentions: platform().mentionIndex(),
    recipes: db.recipes,
    connections: db.connections,
    rules: platform().getRules(),
    providers: platform().listProviders(),
    presence: db.presence.filter((p) => p.workspaceId === id),
    lock: db.runLock[id] ?? null,
    env: platform().envPreview(id),
    divergence: platform().workspaceDivergence(id),
    quota: { usedMb: Math.round((workspace.bytes ?? 386 * 1024 * 1024) / (1024 * 1024)), limitMb: 2048 },
    migrationLog: db.migrationLog,
    previewPath: `/-/p/${workspace.previewToken}/`,
  };
});
