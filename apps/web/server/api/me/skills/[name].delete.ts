import { requireUser } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const name = getRouterParam(event, "name")!;
  try {
    return { skills: platform().deleteUserSkill(user, name) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "error" });
  }
});
