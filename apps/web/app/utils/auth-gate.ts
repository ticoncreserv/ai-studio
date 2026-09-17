function normalizePath(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}

function pathIs(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/** Vue pages that guests may open. Everything else requires a session. */
export function isPublicStudioPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (path === "/") return true;
  if (pathIs(path, "/share")) return true;
  if (pathIs(path, "/invite")) return true;
  if (pathIs(path, "/setup/github")) return true;
  return false;
}

/** Nitro also sees APIs, Vite, and the Laravel preview — never bounce those to login. */
export function isAuthExemptRequestPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (isPublicStudioPath(path)) return true;
  if (path.startsWith("/api/")) return true;
  if (path.startsWith("/_")) return true;
  if (path.startsWith("/-/p/")) return true;
  if (path.startsWith("/auth/")) return true;
  if (path.startsWith("/webhooks/")) return true;
  if (path.startsWith("/assets/")) return true;
  if (path.startsWith("/resources/")) return true;
  if (path.startsWith("/storage/")) return true;
  if (pathIs(path, "/json")) return true;
  if (/\.[a-z0-9]+$/i.test(path)) return true;
  return false;
}

export function shouldRedirectUnauthenticatedToHome(pathname: string, authenticated: boolean): boolean {
  if (authenticated) return false;
  return !isAuthExemptRequestPath(pathname);
}
