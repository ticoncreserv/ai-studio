import { applyStoredGitHubAppCredentials, syncGitHubAppPublicUrls } from "@atelier/supervisor";

export default defineNitroPlugin(() => {
  applyStoredGitHubAppCredentials();
  void syncGitHubAppPublicUrls();
});
