import { requireUser } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id")!;
  try {
    return { rules: platform().deleteUserRule(user, id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    if (message === "Rule not found") throw createError({ statusCode: 404, statusMessage: message });
    throw createError({ statusCode: 400, statusMessage: message });
  }
});
