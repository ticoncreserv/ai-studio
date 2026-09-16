import { canSetupGitHubApp, convertGitHubAppManifest, saveGitHubAppCredentials, applyStoredGitHubAppCredentials } from "@atelier/supervisor";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const redirect = (error?: string) =>
    sendRedirect(event, error ? `/setup/github?error=${encodeURIComponent(error)}` : "/setup/github?created=1");

  if (!canSetupGitHubApp()) return redirect("blocked");

  const expected = getCookie(event, "atelier_github_app_state");
  const state = String(query.state ?? "");
  if (!expected || !state || expected !== state) return redirect("state");

  const code = String(query.code ?? "");
  if (!code) return redirect("code");

  try {
    const creds = await convertGitHubAppManifest(code);
    saveGitHubAppCredentials(creds);
    applyStoredGitHubAppCredentials();
    deleteCookie(event, "atelier_github_app_state", { path: "/" });
    return redirect();
  } catch {
    return redirect("convert");
  }
});
