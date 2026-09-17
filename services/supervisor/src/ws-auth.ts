import { verifySession } from "./session-cookie.js";
import type { PlatformStore, UserRecord, WorkspaceRecord } from "./store.js";

export function cookieValue(header: string | undefined | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function authorizeSessionSocket(input: {
  cookieHeader?: string | null;
  sessionId: string;
  origin?: string | null;
  expectedOrigins?: string[];
  platform: {
    store: PlatformStore;
    canAccessWorkspace: (user: UserRecord, workspace: WorkspaceRecord, mode: "view" | "edit") => boolean;
  };
}): { ok: true; userId: string; workspaceId: string } | { ok: false; status: number; message: string } {
  if (input.expectedOrigins?.length && input.origin && !input.expectedOrigins.includes(input.origin)) {
    return { ok: false, status: 403, message: "origin not allowed" };
  }
  const raw = cookieValue(input.cookieHeader, "atelier_session");
  const parsed = verifySession(raw);
  if (!parsed) return { ok: false, status: 401, message: "unauthorized" };
  if (!input.sessionId) return { ok: false, status: 400, message: "session required" };
  const db = input.platform.store.read();
  const user = db.users.find((row) => row.id === parsed.userId);
  if (!user || user.disabled) return { ok: false, status: 403, message: "forbidden" };
  const session = db.sessions.find((row) => row.id === input.sessionId);
  if (!session) return { ok: false, status: 404, message: "session not found" };
  const workspace = db.workspaces.find((row) => row.id === session.workspaceId);
  if (!workspace) return { ok: false, status: 404, message: "workspace not found" };
  try {
    if (!input.platform.canAccessWorkspace(user, workspace, "view")) {
      return { ok: false, status: 403, message: "forbidden" };
    }
  } catch {
    return { ok: false, status: 403, message: "forbidden" };
  }
  return { ok: true, userId: user.id, workspaceId: workspace.id };
}
