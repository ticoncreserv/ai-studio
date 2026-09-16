import { signSession } from "@atelier/supervisor";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ login?: string; locale?: "en" | "pt-BR" }>(event);
  const user = await platform().loginDev(body.login || "studio", body.locale || "pt-BR");
  setCookie(event, "atelier_session", signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return { user };
});
