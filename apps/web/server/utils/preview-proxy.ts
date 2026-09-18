import type { H3Event } from "h3";
import { sendStream } from "h3";
import { APP_LOCALE_COOKIE } from "../../app/utils/app-locale";
import { runPreviewProxy } from "./preview-proxy-core";
import type { PreviewUnavailableReason } from "./preview-unavailable";
import { previewUnavailablePayload } from "./preview-unavailable";
import { previewTokenCookie, rewriteSetCookie, viteSearchForAssetModule } from "./preview-rewrite";

function sendPreviewUnavailable(event: H3Event, statusCode: number, reason: PreviewUnavailableReason) {
  const payload = previewUnavailablePayload(reason, getHeader(event, "accept"), getCookie(event, APP_LOCALE_COOKIE));
  setResponseStatus(event, statusCode, payload.statusMessage);
  setHeader(event, "cache-control", "no-store");
  setHeader(event, "content-type", payload.contentType);
  return payload.body;
}

function applyPreviewResponseHeaders(
  event: H3Event,
  status: number,
  outgoing: Headers,
  cookies: string[],
  prefix: string,
  token: string,
) {
  setResponseStatus(event, status);
  for (const [key, value] of outgoing.entries()) {
    if (key === "transfer-encoding" || key === "content-encoding") continue;
    if (key === "set-cookie") continue;
    setHeader(event, key, value);
  }
  setHeader(event, "set-cookie", [...cookies.map((cookie) => rewriteSetCookie(cookie, prefix)), previewTokenCookie(token)]);
}

export async function proxyPreview(event: H3Event, token: string, rest = "") {
  const incoming = getRequestURL(event);
  const method = getMethod(event);
  const result = await runPreviewProxy({
    token,
    rest,
    method,
    search: viteSearchForAssetModule(
      incoming.pathname,
      incoming.search,
      rest,
      getHeader(event, "sec-fetch-dest"),
    ),
    header: (name) => getHeader(event, name),
    body: method === "GET" || method === "HEAD" ? undefined : await readRawBody(event),
  });
  if (result.kind === "unavailable") return sendPreviewUnavailable(event, result.status, result.reason);
  applyPreviewResponseHeaders(event, result.status, result.headers, result.cookies, result.prefix, token);
  if (result.stream) {
    if (method === "HEAD" || !result.body) return null;
    return sendStream(event, result.body as ReadableStream);
  }
  return result.body as Buffer;
}
