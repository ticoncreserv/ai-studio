import type { SessionEvent } from "@atelier/contracts";
import type { LocationQuery } from "vue-router";
import type { StudioSession } from "~/types/studio";

/** Pick the rail row's transcript so a switch can paint without emptying the chat. */
export function selectedSessionView(
  sessions: StudioSession[],
  id: string,
): { session: StudioSession; events: SessionEvent[] } | null {
  const session = sessions.find((row) => row.id === id);
  if (!session) return null;
  return { session, events: session.events ?? [] };
}

/** Drop a workspace GET that started for a session the user already left. */
export function isStaleSessionRefresh(wantSessionId: string | undefined, activeSessionId: string | undefined): boolean {
  return Boolean(wantSessionId && activeSessionId && wantSessionId !== activeSessionId);
}

export function sessionQuery(current: LocationQuery, sessionId: string): LocationQuery {
  return { ...current, session: sessionId };
}
