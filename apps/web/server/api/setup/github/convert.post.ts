import { canSetupGitHubApp, redeemGitHubAppCode } from "@atelier/supervisor";

export default defineEventHandler(async (event) => {
  if (!canSetupGitHubApp()) throw createError({ statusCode: 403, statusMessage: "GitHub App setup is disabled" });
  const body = await readBody<{ code?: string }>(event);
  const code = body.code?.trim() ?? "";
  if (!code) throw createError({ statusCode: 400, statusMessage: "Missing GitHub manifest code" });
  try {
    const { creds, reused } = await redeemGitHubAppCode(code);
    return { ok: true, reused, slug: creds.slug ?? null, appId: creds.appId };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : "GitHub manifest conversion failed",
    });
  }
});
