import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { ensureViteHotFile, publicViteOrigin, viteDevAssetPath } from "@atelier/supervisor";
import { APP_LOCALE_COOKIE } from "../../app/utils/app-locale";
import { platform } from "./platform";
import { previewUnavailablePayload, type PreviewUnavailableReason } from "./preview-unavailable";
import {
  isOrphanLaravelPublicPath,
  parsePreviewMountPath,
  PREVIEW_TOKEN_COOKIE,
  previewPathnameFromRequest,
  previewTokenCookie,
  previewTokenFromReferer,
  previewWorkspaceIdFromReferer,
  rewritePreviewDocument,
  rewritePreviewLocation,
  rewriteSetCookie,
  rewriteViteBareImports,
  shouldRewriteViteBody,
  shouldStreamPreviewBody,
  viteSearchForAssetModule,
} from "./preview-rewrite";

const FORWARD_HEADERS = [
  "cookie",
  "content-type",
  "accept",
  "range",
  "if-range",
  "x-csrf-token",
  "x-xsrf-token",
  "x-requested-with",
  "authorization",
  "origin",
  "referer",
  "x-inertia",
  "x-inertia-version",
  "x-inertia-partial-data",
  "x-inertia-partial-component",
  "x-inertia-reset",
  "x-inertia-error-bag",
];

export type PreviewProxyRequest = {
  token: string;
  rest: string;
  method: string;
  search: string;
  header: (name: string) => string | undefined;
  body?: BodyInit;
};

export type PreviewProxyResult =
  | { kind: "unavailable"; status: number; reason: PreviewUnavailableReason; accept?: string; locale?: string }
  | {
      kind: "ok";
      status: number;
      headers: Headers;
      cookies: string[];
      prefix: string;
      body: Buffer | ReadableStream | null;
      stream: boolean;
    };

export function cookieNamed(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function resolveOrphanPreviewToken(referer: string | undefined, cookie: string | undefined): string | null {
  const fromMount = previewTokenFromReferer(referer);
  if (fromMount) return fromMount;
  const workspaceId = previewWorkspaceIdFromReferer(referer);
  if (workspaceId) {
    const ws = platform().store.read().workspaces.find((row) => row.id === workspaceId);
    if (ws?.previewToken) return ws.previewToken;
  }
  return cookieNamed(cookie, PREVIEW_TOKEN_COOKIE) ?? null;
}

export async function runPreviewProxy(input: PreviewProxyRequest): Promise<PreviewProxyResult> {
  const ws = platform().store.read().workspaces.find((row) => row.previewToken === input.token);
  const accept = input.header("accept");
  const locale = cookieNamed(input.header("cookie"), APP_LOCALE_COOKIE);
  if (!ws) return { kind: "unavailable", status: 404, reason: "missing", accept, locale };
  if (!ws.port) {
    return { kind: "unavailable", status: 503, reason: "hibernated", accept, locale };
  }
  if (ws.vitePort) {
    ensureViteHotFile(ws.worktree, publicViteOrigin(platform().publicPreviewUrl(ws.previewToken)));
  }

  const vitePath = ws.vitePort ? viteDevAssetPath(input.rest) : null;
  const target = vitePath
    ? `http://127.0.0.1:${ws.vitePort}${vitePath}${input.search}`
    : `http://127.0.0.1:${ws.port}/${input.rest}${input.search}`;
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = input.header(name);
    if (value) headers.set(name, value);
  }

  let res: Response;
  try {
    res = await fetch(target, {
      method: input.method,
      headers,
      body: input.method === "GET" || input.method === "HEAD" ? undefined : input.body,
      redirect: "manual",
    });
  } catch {
    const reason = platform().runtime.isRunning(ws.id) ? "down" : "hibernated";
    return { kind: "unavailable", status: 503, reason, accept, locale };
  }

  const prefix = `/-/p/${input.token}`;
  const outgoing = new Headers(res.headers);
  outgoing.delete("x-frame-options");
  outgoing.set("content-security-policy", "frame-ancestors *");
  for (const name of ["location", "x-inertia-location"] as const) {
    const location = outgoing.get(name);
    if (location) outgoing.set(name, rewritePreviewLocation(location, ws.port, prefix, ws.vitePort));
  }
  outgoing.set("x-atelier-preview", "1");
  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (cookies.length) {
    outgoing.delete("set-cookie");
    for (const cookie of cookies) outgoing.append("set-cookie", rewriteSetCookie(cookie, prefix));
  } else {
    const single = outgoing.get("set-cookie");
    if (single) outgoing.set("set-cookie", rewriteSetCookie(single, prefix));
  }

  const ctype = outgoing.get("content-type") ?? "";
  if (input.method === "HEAD" || shouldStreamPreviewBody(ctype, input.rest)) {
    return { kind: "ok", status: res.status, headers: outgoing, cookies, prefix, body: res.body, stream: true };
  }

  let buf = Buffer.from(await res.arrayBuffer());
  if (vitePath && shouldRewriteViteBody(ctype, input.search, vitePath)) {
    buf = Buffer.from(rewriteViteBareImports(buf.toString("utf8"), `${prefix}/__vite`));
    outgoing.delete("content-length");
    outgoing.set("cache-control", "no-store");
  } else if (!vitePath && /html|json/i.test(ctype)) {
    buf = Buffer.from(rewritePreviewDocument(buf.toString("utf8"), ws.port, prefix));
    outgoing.delete("content-length");
  }
  return { kind: "ok", status: res.status, headers: outgoing, cookies, prefix, body: buf, stream: false };
}

/** Vite middleware intercepts `/-/p/*` before Nitro, so login POSTs never hit `readRawBody`. */
export async function readPreviewProxyBody(req: IncomingMessage, method: string): Promise<Buffer | undefined> {
  if (method === "GET" || method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function splitRequestUrl(raw: string): { pathname: string; search: string } {
  const q = raw.indexOf("?");
  const encoded = q >= 0 ? raw.slice(0, q) : raw;
  let pathname = encoded;
  try {
    pathname = decodeURIComponent(encoded);
  } catch {
    // keep the encoded path when decodeURIComponent rejects the URL
  }
  return { pathname, search: q >= 0 ? raw.slice(q) : "" };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function writeUnavailable(res: ServerResponse, status: number, reason: PreviewUnavailableReason, req: IncomingMessage) {
  const payload = previewUnavailablePayload(
    reason,
    headerValue(req.headers.accept),
    cookieNamed(headerValue(req.headers.cookie), APP_LOCALE_COOKIE),
  );
  res.statusCode = status;
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", payload.contentType);
  res.end(payload.body);
}

function writePreviewHeaders(
  res: ServerResponse,
  status: number,
  outgoing: Headers,
  cookies: string[],
  prefix: string,
  token: string,
) {
  res.statusCode = status;
  for (const [key, value] of outgoing.entries()) {
    if (key === "transfer-encoding" || key === "content-encoding") continue;
    if (key === "set-cookie") continue;
    res.setHeader(key, value);
  }
  res.setHeader("set-cookie", [...cookies.map((cookie) => rewriteSetCookie(cookie, prefix)), previewTokenCookie(token)]);
}

/** Dev: Nuxt Vite would otherwise steal `?import` under /-/p/ and emit /_nuxt/@fs/__skip_vite. */
export async function proxyPreviewNode(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const raw = req.url || "";
  const { pathname, search } = splitRequestUrl(raw);
  const logicalPath = previewPathnameFromRequest(pathname);
  const mount = parsePreviewMountPath(pathname);
  let token: string | null;
  let rest: string;
  if (mount) {
    token = mount.token;
    rest = mount.rest;
  } else if (isOrphanLaravelPublicPath(pathname)) {
    token = resolveOrphanPreviewToken(
      headerValue(req.headers.referer) ?? headerValue(req.headers.referrer),
      headerValue(req.headers.cookie),
    );
    if (!token) {
      res.statusCode = 404;
      res.setHeader("cache-control", "no-store");
      res.end();
      return true;
    }
    rest = logicalPath.replace(/^\//, "");
  } else {
    return false;
  }
  if (!token) return false;

  const method = (req.method || "GET").toUpperCase();
  const result = await runPreviewProxy({
    token,
    rest,
    method,
    search: viteSearchForAssetModule(pathname, search, rest, headerValue(req.headers["sec-fetch-dest"])),
    header: (name) => headerValue(req.headers[name.toLowerCase()]),
    body: await readPreviewProxyBody(req, method),
  });
  if (result.kind === "unavailable") {
    writeUnavailable(res, result.status, result.reason, req);
    return true;
  }
  writePreviewHeaders(res, result.status, result.headers, result.cookies, result.prefix, token);
  if (method === "HEAD" || !result.body) {
    res.end();
    return true;
  }
  if (result.stream && typeof result.body === "object" && "getReader" in result.body) {
    Readable.fromWeb(result.body as import("node:stream/web").ReadableStream).pipe(res);
    return true;
  }
  res.end(result.body as Buffer);
  return true;
}
