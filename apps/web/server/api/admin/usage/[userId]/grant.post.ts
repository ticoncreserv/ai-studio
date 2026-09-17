import { requirePlatformAdmin } from "../../../../utils/authz";
import { platform } from "../../../../utils/platform";

export default defineEventHandler(async (event) => {
  const actor = requirePlatformAdmin(event);
  const userId = getRouterParam(event, "userId")!;
  const body = await readBody<{ tokens?: number; reason?: string }>(event);
  if (typeof body.tokens !== "number") {
    throw createError({ statusCode: 400, statusMessage: "tokens required" });
  }
  try {
    const usage = platform().grantUsageTokens(actor, userId, body.tokens, body.reason ?? "");
    return { usage, users: platform().listUsageSummaries() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid grant";
    const statusCode = message === "Forbidden" ? 403 : message === "User not found" ? 404 : 400;
    throw createError({ statusCode, statusMessage: message, message, data: { message } });
  }
});
