import {
  GITHUB_ACCESSED_PATHS,
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
  syncGitHubAppPublicUrls,
} from "@atelier/supervisor";
import { randomBytes } from "node:crypto";
import { requestPublicUrl } from "../../utils/public-url";

export default defineEventHandler(async (event) => {
  const configured = hasGitHubOAuth();
  const canCreate = canSetupGitHubApp() && !configured;
  const creds = loadGitHubAppCredentials();
  const publicUrl = requestPublicUrl(event);
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
  if (configured) await syncGitHubAppPublicUrls().catch(() => false);
  const listenOrigins = [...new Set([publicUrl, ...githubLoopbackOrigins()])];
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
      secret: canSetupGitHubApp() && webhookSecret ? webhookSecret : null,
    },
  };
});
