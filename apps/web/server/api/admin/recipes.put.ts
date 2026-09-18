import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requirePlatformAdmin(event);
  const body = await readBody<{ id?: string; title: string; template: string }>(event);
  try {
    return { recipes: platform().saveAdminRecipe(user, body) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    if (message === "Recipe not found") throw createError({ statusCode: 404, statusMessage: message });
    if (message === "Forbidden") throw createError({ statusCode: 403, statusMessage: message });
    throw createError({ statusCode: 400, statusMessage: message });
  }
});
