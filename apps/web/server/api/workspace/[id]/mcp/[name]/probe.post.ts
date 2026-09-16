import { requireWorkspaceAccess } from "../../../../../../utils/authz";
import { platform } from "../../../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const name = getRouterParam(event, "name")!;
  const { user } = requireWorkspaceAccess(event, id, "edit");
  try {
    return await platform().probeMcp(user, id, name);
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "error" });
  }
});
