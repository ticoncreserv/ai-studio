import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requirePlatformAdmin(event);
  const body = await readBody<{
    rules: Array<{ id: string; level: "platform" | "project" | "user"; title: string; body: string }>;
  }>(event);
  if (!body.rules?.length) throw createError({ statusCode: 400 });
  return { rules: platform().saveAdminRules(body.rules, user.locale) };
});
