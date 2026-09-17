import { resolveOrphanPreviewToken } from "../../utils/preview-proxy-core";
import { proxyPreview } from "../../utils/preview-proxy";

// Vite-imported files live under /resources (e.g. resources/images/*.png).
// Production has no Vite middleware, so leftover requests still proxy.
export default defineEventHandler((event) => {
  const token = resolveOrphanPreviewToken(
    getHeader(event, "referer") ?? getHeader(event, "referrer"),
    getHeader(event, "cookie"),
  );
  if (!token) {
    setHeader(event, "cache-control", "no-store");
    return sendNoContent(event, 404);
  }
  const rest = getRouterParam(event, "path");
  const tail = Array.isArray(rest) ? rest.filter(Boolean).join("/") : rest || "";
  return proxyPreview(event, token, tail ? `resources/${tail}` : "resources");
});
