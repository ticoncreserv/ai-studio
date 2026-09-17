import { verifySession } from "@atelier/supervisor";
import { shouldRedirectUnauthenticatedToHome } from "../../app/utils/auth-gate";

export default defineEventHandler((event) => {
  const raw = getCookie(event, "atelier_session");
  const parsed = verifySession(raw);
  if (parsed) event.context.userId = parsed.userId;

  const method = event.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return;
  const path = (event.path || "/").split("?")[0] || "/";
  if (path.startsWith("/api/")) return;
  const accept = getHeader(event, "accept") ?? "";
  if (accept.includes("application/json") && !accept.includes("text/html")) return;
  if (!shouldRedirectUnauthenticatedToHome(path, Boolean(parsed))) return;
  return sendRedirect(event, "/");
});

