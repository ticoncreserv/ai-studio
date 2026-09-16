import {
  canSetupGitHubApp,
  githubAppCreateAction,
  githubAppInstallUrl,
  githubAppManifest,
  githubAppOrg,
  githubAppRepo,
  hasGitHubOAuth,
  loadGitHubAppCredentials,
} from "@atelier/supervisor";
import { randomBytes } from "node:crypto";
import { requestPublicUrl } from "../../utils/public-url";

export default defineEventHandler((event) => {
  const configured = hasGitHubOAuth();
  const canCreate = canSetupGitHubApp() && !configured;
  const creds = loadGitHubAppCredentials();
  const publicUrl = requestPublicUrl(event);
  const state = randomBytes(16).toString("hex");
  if (canCreate) {
    setCookie(event, "atelier_github_app_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
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
  };
});
