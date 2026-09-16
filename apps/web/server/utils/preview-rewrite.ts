import { VITE_PREVIEW_SEGMENT } from "@atelier/supervisor";
import { injectPreviewWait } from "./preview-wait";

const PREVIEW_MOUNT_RE = /^(\/-\/p\/[^/]+)/;

export function previewMountPrefix(prefix: string): string {
  const clean = prefix.replace(/\/$/, "");
  return clean.match(PREVIEW_MOUNT_RE)?.[1] ?? clean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isViteDevPath(path: string): boolean {
  return /^(?:\/@vite(?:\/|$)|\/@fs\/|\/@id\/|\/@url\/|\/resources\/|\/node_modules\/|\/__vite_ping)/.test(path);
}

function isInertiaPage(value: unknown): value is { url: string; component: string } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { component?: unknown }).component === "string" &&
    typeof (value as { url?: unknown }).url === "string"
  );
}

export function scopePreviewHref(href: string, prefix: string): string {
  const mount = previewMountPrefix(prefix);
  if (!href) return href;
  const value = href.trim();
  if (!value) return href;
  if (value.startsWith(mount + "/") || value === mount || value.startsWith(`${mount}?`) || value.startsWith(`${mount}#`)) {
    return value;
  }
  if (value.startsWith("/") && !value.startsWith("//")) {
    return `${mount}${value}`;
  }
  try {
    const url = new URL(value);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return value;
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.pathname === mount || url.pathname.startsWith(`${mount}/`)) return path;
    if (isViteDevPath(url.pathname)) return `${mount}/${VITE_PREVIEW_SEGMENT}${path}`;
    return scopePreviewHref(path || "/", mount);
  } catch {
    return value;
  }
}

export function rewriteSetCookie(value: string, cookiePath: string): string {
  if (/;\s*path=/i.test(value)) return value.replace(/;\s*path=[^;]*/i, `; Path=${cookiePath}`);
  return `${value}; Path=${cookiePath}`;
}

export function rewriteLocation(location: string, port: number, prefix: string): string {
  const next = location
    .replaceAll(`http://127.0.0.1:${port}`, prefix)
    .replaceAll(`http://localhost:${port}`, prefix)
    .replaceAll(`https://127.0.0.1:${port}`, prefix)
    .replaceAll(`https://localhost:${port}`, prefix);
  return scopePreviewHref(next, prefix);
}

export function rewritePreviewLocation(
  location: string,
  artisanPort: number,
  prefix: string,
  vitePort?: number,
): string {
  const mount = previewMountPrefix(prefix);
  let next = rewriteLocation(location, artisanPort, mount);
  if (vitePort) next = rewriteLocation(next, vitePort, `${mount}/${VITE_PREVIEW_SEGMENT}`);
  return scopePreviewHref(next, mount);
}

export function rewriteInertiaPageJson(body: string, prefix: string): string {
  try {
    const page = JSON.parse(body) as unknown;
    if (isInertiaPage(page)) {
      page.url = scopePreviewHref(page.url, prefix);
      return JSON.stringify(page);
    }
  } catch {
    // HTML or non-Inertia JSON
  }
  return body;
}

export function previewScopeScript(prefix: string): string {
  const mount = previewMountPrefix(prefix);
  return `(function(m){if(window.__atelierPreviewScope)return;window.__atelierPreviewScope=m;function s(u){if(u==null||u==="")return u;var r=String(u);if(/^(data:|blob:|javascript:|mailto:|tel:)/i.test(r))return r;if(r.startsWith("//"))return r;if(r===m||r.startsWith(m+"/")||r.startsWith(m+"?")||r.startsWith(m+"#"))return r;if(r.charAt(0)==="/"&&r.charAt(1)!=="/")return m+r;try{var x=new URL(r,window.location.href);if(x.origin===window.location.origin){if(x.pathname===m||x.pathname.indexOf(m+"/")===0)return r;x.pathname=m+x.pathname;return x.pathname+x.search+x.hash;}}catch(e){}return r;}function wrap(fn){return function(a,b,c){return fn.call(this,a,b,c==null?c:s(String(c)));};}history.pushState=wrap(history.pushState.bind(history));history.replaceState=wrap(history.replaceState.bind(history));var f=window.fetch;window.fetch=function(i,n){if(typeof i==="string")i=s(i);else if(typeof URL!=="undefined"&&i instanceof URL)i=new URL(s(i.href));else if(typeof Request!=="undefined"&&i instanceof Request)i=new Request(s(i.url),i);return f.call(this,i,n);};var o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(mth,u){var args=Array.prototype.slice.call(arguments);if(typeof u==="string")args[1]=s(u);return o.apply(this,args);};})(${JSON.stringify(mount)})`;
}

export function injectPreviewScopeScript(html: string, prefix: string): string {
  if (html.includes("__atelierPreviewScope")) return html;
  const tag = `<script>${previewScopeScript(prefix)}</script>`;
  const head = html.match(/<head[^>]*>/i);
  if (head?.index != null) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${tag}${html.slice(at)}`;
  }
  return html;
}

function rewriteInertiaDataPageScripts(html: string, prefix: string): string {
  return html.replace(
    /(<script\b[^>]*\bdata-page="app"[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_match, open: string, json: string, close: string) => `${open}${rewriteInertiaPageJson(json, prefix)}${close}`,
  );
}

function rewriteLoopbackDocuments(body: string, artisanPort: number, prefix: string): string {
  const mount = previewMountPrefix(prefix);
  return body
    .replaceAll(`http://127.0.0.1:${artisanPort}`, mount)
    .replaceAll(`http://localhost:${artisanPort}`, mount)
    .replace(new RegExp(`https?://(?:127\\.0\\.0\\.1|localhost):\\d+${escapeRegExp(mount)}`, "g"), mount)
    .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+(\/[^"'<\s]*)/g, (_match, path: string) =>
      scopePreviewHref(path || "/", mount),
    );
}

export function rewritePreviewDocument(body: string, artisanPort: number, prefix: string): string {
  const mount = previewMountPrefix(prefix);
  const rewritten = rewriteLoopbackDocuments(body, artisanPort, mount);
  const trimmed = rewritten.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return rewriteInertiaPageJson(rewritten, mount);
  }
  return injectPreviewWait(injectPreviewScopeScript(rewriteInertiaDataPageScripts(rewritten, mount), mount));
}

export function rewriteViteBareImports(code: string, vitePrefix: string): string {
  const prefix = vitePrefix.replace(/\/$/, "");
  return code
    .replaceAll('"/node_modules/', `"${prefix}/node_modules/`)
    .replaceAll("'/node_modules/", `'${prefix}/node_modules/`)
    .replaceAll('"/resources/', `"${prefix}/resources/`)
    .replaceAll("'/resources/", `'${prefix}/resources/`)
    .replaceAll('"/@vite', `"${prefix}/@vite`)
    .replaceAll("'/@vite", `'${prefix}/@vite`)
    .replaceAll('"/@fs/', `"${prefix}/@fs/`)
    .replaceAll('"/@id/', `"${prefix}/@id/`)
    .replaceAll('"/lang/', `"${prefix}/lang/`)
    .replaceAll("'/lang/", `'${prefix}/lang/`)
    .replaceAll("url(/resources/", `url(${prefix}/resources/`)
    .replaceAll("url(/node_modules/", `url(${prefix}/node_modules/`)
    .replaceAll('"BASE_URL": "/"', `"BASE_URL": "${prefix}/"`);
}
