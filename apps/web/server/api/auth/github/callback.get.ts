import { saveGitHubInstallationId } from "@atelier/supervisor";
import { finishGitHubLogin } from "../../../utils/github-login";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const installationId = String(query.installation_id ?? "").trim();
  if (installationId) saveGitHubInstallationId(installationId);

  const code = String(query.code ?? "").trim();
  if (!code) {
    if (query.setup_action === "install") return sendRedirect(event, "/setup/github?installed=1");
    return sendRedirect(event, "/setup/github?error=oauth");
  }

  try {
    const { next } = await finishGitHubLogin(event, {
      code,
      installationId,
      locale: String(getCookie(event, "atelier-locale") ?? "en"),
    });
    return sendRedirect(event, next);
  } catch {
    const params = new URLSearchParams({ error: "oauth" });
    if (installationId) params.set("installation_id", installationId);
    return sendRedirect(event, `/setup/github?${params.toString()}`);
  }
});
