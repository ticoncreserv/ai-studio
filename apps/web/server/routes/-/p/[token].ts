import { proxyPreview } from "../../../utils/preview-proxy";

export default defineEventHandler((event) => proxyPreview(event, getRouterParam(event, "token")!));
