import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requirePlatformAdmin(event);
  const body = await readBody<{ name: string; description: string; body: string; paths?: string[]; manualOnly?: boolean }>(event);
  try {
    return { skills: platform().saveGlobalSkill(user, body) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "error" });
  }
});
