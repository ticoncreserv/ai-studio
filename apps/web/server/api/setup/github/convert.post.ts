import {
  applyStoredGitHubAppCredentials,
  canSetupGitHubApp,
  convertGitHubAppManifest,
  saveGitHubAppCredentials,
} from "@atelier/supervisor";

export default defineEventHandler(async (event) => {
  if (!canSetupGitHubApp()) throw createError({ statusCode: 403, statusMessage: "GitHub App setup is disabled" });
  const body = await readBody<{ code?: string }>(event);
  const code = body.code?.trim() ?? "";
  if (!code) throw createError({ statusCode: 400, statusMessage: "Missing GitHub manifest code" });
  try {
    const creds = await convertGitHubAppManifest(code);
    saveGitHubAppCredentials(creds);
    applyStoredGitHubAppCredentials();
    return { ok: true, slug: creds.slug ?? null, appId: creds.appId };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : "GitHub manifest conversion failed",
    });
  }
});
