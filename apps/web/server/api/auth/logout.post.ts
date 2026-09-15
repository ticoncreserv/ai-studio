export default defineEventHandler((event) => {
  deleteCookie(event, "atelier_session", { path: "/" });
  return { ok: true };
});
