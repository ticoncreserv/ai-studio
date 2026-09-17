import {
  createAuthProvider,
  githubAppAuthorizeRedirectUri,
  hasGitHubOAuth,
  saveGitHubInstallationId,
  signSession,
  syncGitHubAppPublicUrls,
} from "@atelier/supervisor";
import { requestPublicUrl } from "./public-url";
import { platform } from "./platform";
import type { H3Event } from "h3";

export async function finishGitHubLogin(
  event: H3Event,
  input: { code: string; installationId?: string; locale?: string; state?: string },
) {
  if (input.installationId) saveGitHubInstallationId(input.installationId);
  const provider = createAuthProvider();
  const identity = await provider.completeLogin({
    code: input.code,
    locale: input.locale || String(getCookie(event, "atelier-locale") ?? "pt-BR"),
    // Must match authorize: ATELIER_PUBLIC_URL, not the incoming Host (127.0.0.1 vs localhost).
    redirectUri: oauthRedirectUri(event),
    state: input.state,
  });
  const user = await platform().loginDev(identity.login, identity.locale);
  platform().store.update((db) => {
    const row = db.users.find((u) => u.id === user.id);
    if (row) {
      row.name = identity.name;
      row.email = identity.email;
      row.githubId = identity.githubId;
      row.role = identity.role;
      row.accessPending = identity.accessPending;
    }
  });
  const fresh = platform().store.read().users.find((row) => row.id === user.id) ?? user;
  platform().syncMembership(fresh);
  setCookie(event, "atelier_session", signSession(user.id), { httpOnly: true, sameSite: "lax", path: "/" });
  return {
    user: fresh,
    identity,
    next: fresh.disabled ? "/disabled" : identity.accessPending ? "/pending" : "/",
  };
}

export function oauthRedirectUri(event: H3Event): string {
  return githubAppAuthorizeRedirectUri(requestPublicUrl(event));
}

export async function handleGitHubOAuthStart(event: H3Event) {
  if (!hasGitHubOAuth()) {
    return sendRedirect(event, "/?error=github");
  }
  await syncGitHubAppPublicUrls(undefined, fetch, requestPublicUrl(event)).catch(() => false);
  const provider = createAuthProvider();
  const { url } = await provider.beginLogin(getQuery(event).redirect?.toString() || "/", oauthRedirectUri(event));
  return sendRedirect(event, url);
}

export async function handleGitHubOAuthCallback(event: H3Event) {
  const query = getQuery(event);
  const installationId = String(query.installation_id ?? "").trim();
  if (installationId) saveGitHubInstallationId(installationId);

  const code = String(query.code ?? "").trim();
  if (!code) {
    if (query.setup_action === "install") return sendRedirect(event, "/setup/github?installed=1");
    return sendRedirect(event, "/?error=github");
  }

  try {
    const { next } = await finishGitHubLogin(event, {
      code,
      installationId,
      locale: String(getCookie(event, "atelier-locale") ?? "pt-BR"),
      state: String(query.state ?? ""),
    });
    return sendRedirect(event, next);
  } catch {
    if (query.setup_action === "install") {
      const params = new URLSearchParams({ error: "oauth" });
      if (installationId) params.set("installation_id", installationId);
      return sendRedirect(event, `/setup/github?${params.toString()}`);
    }
    return sendRedirect(event, "/?error=github");
  }
}
