import { requireUser } from "../../../utils/authz";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id")!;
  const body = await readBody<{
    title: string;
    body: string;
    description?: string;
    slug?: string;
    alwaysApply?: boolean;
  }>(event);
  try {
    return { rules: platform().saveUserRule(user, { ...body, id }) };
  } catch (error) {
    throw ruleHttpError(error);
  }
});

function ruleHttpError(error: unknown) {
  const message = error instanceof Error ? error.message : "error";
  if (message === "Rule not found") return createError({ statusCode: 404, statusMessage: message });
  if (message === "Forbidden") return createError({ statusCode: 403, statusMessage: message });
  return createError({ statusCode: 400, statusMessage: message });
}
