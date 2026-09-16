import { proxyPreview } from "../../../../utils/preview-proxy";

export default defineEventHandler((event) => {
  return proxyPreview(event, getRouterParam(event, "token")!, getRouterParam(event, "path") || "");
});
