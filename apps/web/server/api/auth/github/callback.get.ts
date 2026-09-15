import { createAuthProvider, signSession } from "@atelier/supervisor";
import { platform } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const provider = createAuthProvider();
  const query = getQuery(event);
  const identity = await provider.completeLogin({
    code: String(query.code ?? ""),
    locale: String(getCookie(event, "atelier-locale") ?? "en"),
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
  if (identity.accessPending) return sendRedirect(event, "/pending");
  return sendRedirect(event, "/");
});
