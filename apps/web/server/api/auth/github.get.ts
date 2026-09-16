import { createAuthProvider } from "@atelier/supervisor";
import { oauthRedirectUri } from "../../utils/github-login";

export default defineEventHandler(async (event) => {
  const provider = createAuthProvider();
  const { url } = await provider.beginLogin(getQuery(event).redirect?.toString() || "/", oauthRedirectUri(event));
  return sendRedirect(event, url);
});
