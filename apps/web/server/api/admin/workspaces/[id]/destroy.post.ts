import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

function destroyStatusCode(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/cannot disable/i.test(message)) return 400;
  return 500;
}

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  const body = await readBody<{ deactivateUser?: boolean }>(event).catch(() => ({} as { deactivateUser?: boolean }));
  try {
    const workspace = await platform().adminDestroy(id, { deactivateUser: body?.deactivateUser === true });
    return { ok: true, workspace };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Destroy failed";
    throw createError({
      statusCode: destroyStatusCode(message),
      statusMessage: message,
      message,
      data: { message },
    });
  }
});
