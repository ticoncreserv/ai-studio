import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

function hibernateStatusCode(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/already hibernat/i.test(message) || /last running/i.test(message)) return 409;
  return 500;
}

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  try {
    const p = platform();
    const workspace = typeof p.adminHibernate === "function" ? await p.adminHibernate(id) : await p.hibernate(id);
    return { ok: true, workspace };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hibernate failed";
    throw createError({
      statusCode: hibernateStatusCode(message),
      statusMessage: message,
    });
  }
});
