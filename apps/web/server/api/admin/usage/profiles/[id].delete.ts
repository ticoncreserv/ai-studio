import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const id = getRouterParam(event, "id")!;
  const query = getQuery(event);
  const migrateTo = typeof query.migrateTo === "string" && query.migrateTo ? query.migrateTo : undefined;
  try {
    const profiles = platform().deleteUsageProfile(actor, id, migrateTo);
    return { profiles, users: platform().listUsageSummaries() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid profile";
    const statusCode = message === "Forbidden" ? 403 : 400;
    throw createError({ statusCode, statusMessage: message, message, data: { message } });
  }
});
