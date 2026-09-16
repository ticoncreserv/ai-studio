import type { H3Event } from "h3";
import { canInvite } from "@atelier/domain";
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

export function requireInvite(event: H3Event) {
  const user = requireUser(event);
  if (!canInvite(platform().roleFor(user))) {
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
  return user;
}

export function requirePlatformAdmin(event: H3Event) {
  const user = requireUser(event);
  if (!platform().isPlatformAdmin(user)) {
    throw createError({ statusCode: 403, statusMessage: "forbidden" });
  }
  return user;
}
