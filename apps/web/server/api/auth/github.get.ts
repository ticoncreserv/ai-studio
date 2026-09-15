import { createAuthProvider } from "@atelier/supervisor";

export default defineEventHandler(async (event) => {
  const provider = createAuthProvider();
  const { url } = await provider.beginLogin(getQuery(event).redirect?.toString() || "/");
  return sendRedirect(event, url);
});
