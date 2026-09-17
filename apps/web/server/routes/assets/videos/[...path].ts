import { resolveOrphanPreviewToken } from "../../../utils/preview-proxy-core";
import { proxyPreview } from "../../../utils/preview-proxy";

// Production Nitro has no Vite /assets owner. Keep this so leftover
// /assets/videos requests still proxy instead of hitting Vue Router.
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
  return proxyPreview(event, token, tail ? `assets/videos/${tail}` : "assets/videos");
});
