import type { H3Event } from "h3";
import { ensureViteHotFile, publicViteOrigin, viteDevAssetPath } from "@atelier/supervisor";
import { platform } from "./platform";
import { rewritePreviewDocument, rewritePreviewLocation, rewriteSetCookie, rewriteViteBareImports } from "./preview-rewrite";

const FORWARD_HEADERS = [
  "cookie",
  "content-type",
  "accept",
  "x-xsrf-token",
  "x-requested-with",
  "authorization",
  "origin",
  "x-inertia",
  "x-inertia-version",
  "x-inertia-partial-data",
  "x-inertia-partial-component",
  "x-inertia-reset",
  "x-inertia-error-bag",
];

export async function proxyPreview(event: H3Event, token: string, rest = "") {
  const ws = platform().store.read().workspaces.find((row) => row.previewToken === token);
  if (!ws) throw createError({ statusCode: 404, statusMessage: "preview not found" });
  if (!ws.port || !platform().runtime.isRunning(ws.id)) {
    throw createError({ statusCode: 503, statusMessage: "hibernated" });
  }
  if (ws.vitePort) {
    ensureViteHotFile(ws.worktree, publicViteOrigin(platform().publicPreviewUrl(ws.previewToken)));
  }

  const incoming = getRequestURL(event);
  const method = getMethod(event);
  const vitePath = ws.vitePort ? viteDevAssetPath(rest) : null;
  const target = vitePath
    ? `http://127.0.0.1:${ws.vitePort}${vitePath}${incoming.search}`
    : `http://127.0.0.1:${ws.port}/${rest}${incoming.search}`;
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = getHeader(event, name);
    if (value) headers.set(name, value);
  }
  const body = method === "GET" || method === "HEAD" ? undefined : await readRawBody(event);

  let res: Response;
  try {
    res = await fetch(target, { method, headers, body, redirect: "manual" });
  } catch {
    throw createError({ statusCode: 503, statusMessage: "preview process is not running" });
  }

  const prefix = `/-/p/${token}`;
  const outgoing = new Headers(res.headers);
  outgoing.delete("x-frame-options");
  outgoing.set("content-security-policy", "frame-ancestors *");
  for (const name of ["location", "x-inertia-location"] as const) {
    const location = outgoing.get(name);
    if (location) outgoing.set(name, rewritePreviewLocation(location, ws.port, prefix, ws.vitePort));
  }
  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (cookies.length) {
    outgoing.delete("set-cookie");
    for (const cookie of cookies) outgoing.append("set-cookie", rewriteSetCookie(cookie, prefix));
  } else {
    const single = outgoing.get("set-cookie");
    if (single) outgoing.set("set-cookie", rewriteSetCookie(single, prefix));
  }

  let buf = Buffer.from(await res.arrayBuffer());
  const ctype = outgoing.get("content-type") ?? "";
  if (vitePath && !/image|font|wasm|octet-stream/i.test(ctype)) {
    buf = Buffer.from(rewriteViteBareImports(buf.toString("utf8"), `${prefix}/__vite`));
    outgoing.delete("content-length");
  } else if (!vitePath && /html|json/i.test(ctype)) {
    buf = Buffer.from(rewritePreviewDocument(buf.toString("utf8"), ws.port, prefix));
    outgoing.delete("content-length");
  }
  setResponseStatus(event, res.status);
  for (const [key, value] of outgoing.entries()) {
    if (key === "transfer-encoding" || key === "content-encoding") continue;
    if (key === "set-cookie") continue;
    setHeader(event, key, value);
  }
  if (cookies.length) setHeader(event, "set-cookie", cookies.map((cookie) => rewriteSetCookie(cookie, prefix)));
  return buf;
}
