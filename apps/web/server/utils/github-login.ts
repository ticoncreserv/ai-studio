import { createAuthProvider, preferredOAuthRedirectUri, saveGitHubInstallationId, signSession } from "@atelier/supervisor";
import { requestPublicUrl } from "./public-url";
import { platform } from "./platform";
import type { H3Event } from "h3";

export async function finishGitHubLogin(
  event: H3Event,
  input: { code: string; installationId?: string; locale?: string },
) {
  if (input.installationId) saveGitHubInstallationId(input.installationId);
  const provider = createAuthProvider();
  const identity = await provider.completeLogin({
    code: input.code,
    locale: input.locale || String(getCookie(event, "atelier-locale") ?? "en"),
    redirectUri: `${requestPublicUrl(event)}/api/auth/github/callback`,
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
  setCookie(event, "atelier_session", signSession(user.id), { httpOnly: true, sameSite: "lax", path: "/" });
  return { user, identity, next: identity.accessPending ? "/pending" : "/" };
}

export function oauthRedirectUri(event: H3Event): string {
  return preferredOAuthRedirectUri(requestPublicUrl(event));
}
