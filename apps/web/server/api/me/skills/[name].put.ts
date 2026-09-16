import { requireUser } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const name = getRouterParam(event, "name")!;
  const body = await readBody<{ description: string; body: string; paths?: string[]; manualOnly?: boolean }>(event);
  try {
    const skills = platform().saveUserSkill(user, {
      name,
      description: body.description ?? "",
      body: body.body ?? "",
      paths: body.paths,
      manualOnly: body.manualOnly,
    });
    return { skills };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "error" });
  }
});
