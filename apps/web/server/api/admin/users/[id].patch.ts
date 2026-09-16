import { requirePlatformAdmin } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  const body = await readBody<{ platformAdmin?: boolean }>(event);
  if (typeof body.platformAdmin !== "boolean") throw createError({ statusCode: 400, statusMessage: "platformAdmin required" });
  try {
    return { user: platform().setPlatformAdmin(actor, id, body.platformAdmin) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    throw createError({ statusCode: message === "User not found" ? 404 : 400, statusMessage: message });
  }
});
