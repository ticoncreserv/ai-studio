import { applyStoredGitHubAppCredentials } from "@atelier/supervisor";

export default defineNitroPlugin(() => {
  applyStoredGitHubAppCredentials();
});
