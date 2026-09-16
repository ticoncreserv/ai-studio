import { finishGitHubLogin } from "../../../utils/github-login";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ code?: string; installationId?: string }>(event);
  const code = body.code?.trim() ?? "";
  if (!code) throw createError({ statusCode: 400, statusMessage: "Missing GitHub OAuth code" });
  try {
    const result = await finishGitHubLogin(event, {
      code,
      installationId: body.installationId?.trim(),
      locale: String(getCookie(event, "atelier-locale") ?? "en"),
    });
    return { ok: true, next: result.next, login: result.user.login };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : "GitHub login failed",
    });
  }
});
