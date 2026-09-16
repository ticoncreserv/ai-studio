import {
  GITHUB_ACCESSED_PATHS,
  atelierCanonicalOrigin,
  canSetupGitHubApp,
  githubAppCreateAction,
  ensureGitHubWebhookSecret,
  githubAppInstallUrl,
  githubAppManifest,
  githubAppRegisteredCallbackUrls,
  githubAppOrg,
  githubAppRepo,
  githubAppWebhookSettingsUrl,
  githubLoopbackOrigins,
  hasGitHubOAuth,
  loadGitHubAppCredentials,
  saveGitHubAppSetupState,
  shouldIncludeLoopbackCallbacks,
  syncGitHubAppPublicUrls,
} from "@atelier/supervisor";
import { randomBytes } from "node:crypto";
import { requestPublicUrl } from "../../utils/public-url";
import { platform, userFromEvent } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  const admin = Boolean(user && platform().isPlatformAdmin(user));
  if (!canSetupGitHubApp() && !admin) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }
  const configured = hasGitHubOAuth();
  const canCreate = canSetupGitHubApp() && !configured;
  const creds = loadGitHubAppCredentials();
  const requestOrigin = requestPublicUrl(event);
  const publicUrl = atelierCanonicalOrigin(requestOrigin);
  const webhookSecret = configured ? ensureGitHubWebhookSecret() : "";
  const state = randomBytes(16).toString("hex");
  if (canCreate) {
    saveGitHubAppSetupState(state);
    setCookie(event, "atelier_github_app_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
  if (configured) await syncGitHubAppPublicUrls(undefined, fetch, publicUrl).catch(() => false);
  const listenOrigins = shouldIncludeLoopbackCallbacks(publicUrl)
    ? [...new Set([publicUrl, requestOrigin, ...githubLoopbackOrigins()])]
    : [publicUrl];
  return {
    configured,
    canCreate,
    org: githubAppOrg(),
    repo: githubAppRepo(),
    publicUrl,
    action: canCreate ? githubAppCreateAction(githubAppOrg(), state) : null,
    manifest: canCreate ? githubAppManifest(publicUrl) : null,
    installUrl: creds ? githubAppInstallUrl(creds) : `https://github.com/${githubAppRepo()}/settings/installations`,
    storePath: "var/github-app.json",
    listenOrigins,
    accessedPaths: [...GITHUB_ACCESSED_PATHS],
    callbackUrls: githubAppRegisteredCallbackUrls(publicUrl),
    webhook: {
      url: `${publicUrl}/api/webhooks/github`,
      settingsUrl: githubAppWebhookSettingsUrl(creds),
      hasSecret: Boolean(webhookSecret),
      secret: webhookSecret || null,
    },
  };
});
