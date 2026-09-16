import { requireWorkspaceAccess } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const name = getRouterParam(event, "name")!;
  const { user } = requireWorkspaceAccess(event, id, "edit");
  const body = await readBody<{ enabled: boolean }>(event);
  try {
    return platform().setSkillEnabled(user, id, name, Boolean(body.enabled));
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "error" });
  }
});
