import { isPublicStudioPath } from "~/utils/auth-gate";

export default defineNuxtRouteMiddleware(async (to) => {
  if (isPublicStudioPath(to.path)) return;
  try {
    await useRequestFetch()("/api/me", { headers: { accept: "application/json" } });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 401) {
      return navigateTo("/");
    }
  }
});
