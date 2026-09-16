import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const body = await readBody<{ id: string; enabled?: boolean; apiKey?: string }>(event);
  if (!body.id) throw createError({ statusCode: 400, statusMessage: "id required" });
  return { providers: platform().saveProviderSettings(body) };
});
