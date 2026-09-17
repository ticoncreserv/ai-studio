import { requirePlatformAdmin } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const body = await readBody<{ profiles?: unknown }>(event);
  try {
    const profiles = platform().saveUsageProfiles(actor, body.profiles);
    return { profiles, users: platform().listUsageSummaries() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid profiles";
    const statusCode = message === "Forbidden" ? 403 : 400;
    throw createError({ statusCode, statusMessage: message, message, data: { message } });
  }
});
