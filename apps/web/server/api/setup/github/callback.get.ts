import { canSetupGitHubApp, hasGitHubOAuth, redeemGitHubAppCode } from "@atelier/supervisor";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const redirect = (error?: string) =>
    sendRedirect(event, error ? `/setup/github?error=${encodeURIComponent(error)}` : "/setup/github?created=1");

  if (!canSetupGitHubApp()) return redirect("blocked");
  if (hasGitHubOAuth() && !query.code) return redirect();

  const code = String(query.code ?? "").trim();
  if (!code) return redirect(hasGitHubOAuth() ? undefined : "code");

  try {
    const result = await redeemGitHubAppCode(code);
    deleteCookie(event, "atelier_github_app_state", { path: "/" });
    return sendRedirect(event, result.reused ? "/setup/github?created=1&reused=1" : "/setup/github?created=1");
  } catch {
    return redirect(hasGitHubOAuth() ? undefined : "convert");
  }
});
