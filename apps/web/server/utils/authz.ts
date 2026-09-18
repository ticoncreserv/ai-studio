import type { H3Event } from "h3";
import { platform, userFromEvent } from "./platform";

export function requireUser(event: H3Event, options: { allowDisabled?: boolean } = {}) {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "unauthorized" });
  if (user.disabled && !options.allowDisabled) {
    throw createError({ statusCode: 403, statusMessage: "disabled", data: { disabled: true, message: "disabled" } });
  }
  return user;
}

export function requireWorkspaceAccess(
  event: H3Event,
  workspaceId: string,
  mode: "view" | "edit",
) {
  const user = requireUser(event);
  try {
    const workspace = platform().assertWorkspaceAccess(user, workspaceId, mode);
    return { user, workspace };
  } catch (error) {
    if (error instanceof Error && error.message === "Workspace not found") {
      throw createError({ statusCode: 404, statusMessage: "workspace not found" });
    }
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
}

export function requireInvite(event: H3Event, workspaceId: string) {
  const user = requireUser(event);
  if (!platform().canCreateInvite(user, workspaceId)) {
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
  return user;
}

export function requireWorkspaceManage(event: H3Event, workspaceId: string) {
  const { user, workspace } = requireWorkspaceAccess(event, workspaceId, "view");
  if (!platform().canManageWorkspace(user, workspace)) {
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
  return { user, workspace };
}

export function throwPlatformError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === "Forbidden") throw createError({ statusCode: 403, statusMessage: "forbidden" });
  if (message === "Workspace not found") throw createError({ statusCode: 404, statusMessage: "workspace not found" });
  if (message === "Invite not found") throw createError({ statusCode: 404, statusMessage: "invite not found" });
  if (message === "Invite expired") throw createError({ statusCode: 410, statusMessage: "invite expired" });
  if (message === "Invite already used") throw createError({ statusCode: 409, statusMessage: "invite used" });
  if (message === "Cannot accept own workspace invite") {
    throw createError({ statusCode: 400, statusMessage: "own workspace" });
  }
  if (message === "User not found") throw createError({ statusCode: 404, statusMessage: "user not found" });
  if (message === "Invalid role") throw createError({ statusCode: 400, statusMessage: "invalid role" });
  throw createError({ statusCode: 400, statusMessage: message || "error" });
}

export function requirePlatformAdmin(event: H3Event) {
  const user = requireUser(event);
  if (!platform().isPlatformAdmin(user)) {
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
  return user;
}
