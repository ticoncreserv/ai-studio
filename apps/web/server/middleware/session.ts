import { verifySession } from "@atelier/supervisor";

export default defineEventHandler((event) => {
  const raw = getCookie(event, "atelier_session");
  const parsed = verifySession(raw);
  if (parsed) event.context.userId = parsed.userId;
});
