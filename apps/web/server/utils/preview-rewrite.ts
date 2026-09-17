import { VITE_PREVIEW_SEGMENT } from "@atelier/supervisor";
import { injectPreviewMetrics } from "./preview-metrics";
import { injectPreviewWait } from "./preview-wait";
// Metrics script is generated in preview-metrics.ts and injected last.

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
  const vite = `${mount}/${VITE_PREVIEW_SEGMENT}`;
  return `(function(m,v){if(window.__atelierPreviewScope)return;window.__atelierPreviewScope=m;function s(u){if(u==null||u==="")return u;var r=String(u);if(/^(data:|blob:|javascript:|mailto:|tel:)/i.test(r))return r;if(r.startsWith("//"))return r;if(r.startsWith("/_nuxt/")||r.startsWith("/__nuxt")||r.startsWith("/@vite")||r.startsWith("/@id")||r.startsWith("/@fs"))return r;if(r===m||r.startsWith(m+"/")||r.startsWith(m+"?")||r.startsWith(m+"#"))return r;if(r.charAt(0)==="/"&&r.charAt(1)!=="/")return m+r;try{var x=new URL(r,window.location.href);var loop=x.hostname==="127.0.0.1"||x.hostname==="localhost"||x.hostname==="[::1]";if(x.origin===window.location.origin||loop){if(x.pathname===m||x.pathname.indexOf(m+"/")===0)return r;if(/^\\/(?:@vite(?:\\/|$)|@fs\\/|@id\\/|@url\\/|resources\\/|node_modules\\/|__vite_ping)/.test(x.pathname))return v+x.pathname+x.search+x.hash;x.pathname=m+x.pathname;return x.pathname+x.search+x.hash;}}catch(e){}return r;}function wrap(fn){return function(a,b,c){return fn.call(this,a,b,c==null?c:s(String(c)));};}history.pushState=wrap(history.pushState.bind(history));history.replaceState=wrap(history.replaceState.bind(history));var f=window.fetch;window.fetch=function(i,n){if(typeof i==="string")i=s(i);else if(typeof URL!=="undefined"&&i instanceof URL)i=new URL(s(i.href));else if(typeof Request!=="undefined"&&i instanceof Request)i=new Request(s(i.url),i);return f.call(this,i,n);};var o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(mth,u){var args=Array.prototype.slice.call(arguments);if(typeof u==="string")args[1]=s(u);return o.apply(this,args);};function patch(c,p){if(!c||!c.prototype)return;try{var d=Object.getOwnPropertyDescriptor(c.prototype,p);if(!d||!d.set)return;Object.defineProperty(c.prototype,p,{configurable:true,enumerable:d.enumerable!==false,get:d.get,set:function(v){d.set.call(this,typeof v==="string"?s(v):v);}});}catch(e){}}patch(window.HTMLSourceElement,"src");patch(window.HTMLMediaElement,"src");patch(window.HTMLImageElement,"src");patch(window.HTMLFormElement,"action");var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(typeof n==="string"&&/^(src|href|poster|action)$/i.test(n)&&typeof v==="string")arguments[1]=s(v);return sa.apply(this,arguments);};document.addEventListener("submit",function(ev){var t=ev.target;if(t&&t.tagName==="FORM"){var a=t.getAttribute("action");if(typeof a==="string"&&a)t.setAttribute("action",s(a));}},true);})(${JSON.stringify(mount)},${JSON.stringify(vite)})`;
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

// Laravel public files (php artisan serve → public/). ticoncreserv/app keeps splash
// media at public/assets/{images,videos} and Vue hardcodes "/assets/..." with Vite
// transformAssetUrls.includeAbsolute=false, so the browser would otherwise hit Nuxt.
const LARAVEL_PUBLIC_ROOTS = ["assets", "storage"] as const;

export function rewriteLaravelPublicRoots(code: string, prefix: string): string {
  const mount = previewMountPrefix(prefix);
  let next = code;
  for (const root of LARAVEL_PUBLIC_ROOTS) {
    next = next
      .replaceAll(`"/${root}/`, `"${mount}/${root}/`)
      .replaceAll(`'/${root}/`, `'${mount}/${root}/`)
      .replaceAll(`url(/${root}/`, `url(${mount}/${root}/`);
  }
  return next;
}

// Nuxt marks non-`/_nuxt/` URLs `_skip_transform` and, for `sec-fetch-dest: script`,
// rewrites `req.url` to `/__skip_vite/...` (query stripped) right before Vite's
// transform middleware. The browser then loads `/_nuxt/@fs/__skip_vite/-/p/...`.
const NUXT_SKIP_VITE_PREFIXES = ["/_nuxt/@fs/__skip_vite", "/@fs/__skip_vite", "/__skip_vite"] as const;

export const PREVIEW_TOKEN_COOKIE = "atelier-preview-token";

export function previewPathnameFromRequest(pathname: string): string {
  for (const prefix of NUXT_SKIP_VITE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const rest = pathname.slice(prefix.length);
      return rest.startsWith("/") ? rest : rest ? `/${rest}` : "/";
    }
  }
  return pathname;
}

export function parsePreviewMountPath(pathname: string): { token: string; rest: string } | null {
  const match = previewPathnameFromRequest(pathname).match(/^\/-\/p\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return { token: match[1], rest: match[2] ?? "" };
}

export function previewTokenFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer, "http://localhost");
    const fromMount = parsePreviewMountPath(url.pathname)?.token;
    if (fromMount) return fromMount;
    return url.pathname.match(/\/-\/p\/([^/]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function previewWorkspaceIdFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer, "http://localhost");
    return url.pathname.match(/^\/w\/([^/]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isNuxtSkipVitePath(pathname: string): boolean {
  return NUXT_SKIP_VITE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Nuxt skip_vite strips `?import`, so image modules would be served as raw PNG to `<script type="module">`. */
export function viteSearchForAssetModule(
  pathname: string,
  search: string,
  rest: string,
  dest: string | undefined,
): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (/(?:^|&)(?:import|url|vue)(?:=|&|$)/i.test(raw) || raw.startsWith("import")) return search;
  if (!isNuxtSkipVitePath(pathname)) return search;
  const destName = (dest || "").toLowerCase();
  if (destName === "image" || destName === "video" || destName === "audio" || destName === "font") return search;
  if (!/\.(?:png|jpe?g|gif|webp|svg|ico|avif|bmp|mp4|webm|woff2?|ttf|eot|otf)(?:$|\?)/i.test(rest)) return search;
  return raw ? `?${raw}&import` : "?import";
}

export function previewTokenCookie(token: string): string {
  return `${PREVIEW_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}

export function isOrphanLaravelPublicPath(pathname: string): boolean {
  const path = previewPathnameFromRequest(pathname);
  if (path.startsWith("/storage/") || path.startsWith("/resources/")) return true;
  if (!path.startsWith("/assets/")) return false;
  // Nuxt serves studio CSS from /assets/css. Laravel public media is everything else.
  return path !== "/assets/css" && !path.startsWith("/assets/css/");
}

export function orphanLaravelPublicPreviewPath(pathname: string, token: string): string {
  const path = previewPathnameFromRequest(pathname.startsWith("/") ? pathname : `/${pathname}`);
  return `/-/p/${token}${path}`;
}

export function shouldStreamPreviewBody(contentType: string, rest: string): boolean {
  if (/video|audio/i.test(contentType)) return true;
  return /\.(?:mp4|webm|mov|m4v|mp3|wav|ogg|m4a)(?:$|\?)/i.test(rest);
}

/** Rewrite Vite JS/CSS even when the file is an image imported as `?import`. */
export function shouldRewriteViteBody(contentType: string, search: string, rest: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (/(?:^|&)(?:import|url|vue)(?:=|&|$)/i.test(query) || query.startsWith("import")) return true;
  if (/\.(?:m?[jt]s|cjs|tsx|mts|vue|css|json|svg)(?:$|\?)/i.test(rest)) return true;
  if (/javascript|ecmascript|json|css|xml|text\//i.test(contentType)) return true;
  return false;
}

function rewriteLoopbackDocuments(body: string, artisanPort: number, prefix: string): string {
  const mount = previewMountPrefix(prefix);
  return rewriteLaravelPublicRoots(
    body
      .replaceAll(`http://127.0.0.1:${artisanPort}`, mount)
      .replaceAll(`http://localhost:${artisanPort}`, mount)
      .replace(new RegExp(`https?://(?:127\\.0\\.0\\.1|localhost):\\d+${escapeRegExp(mount)}`, "g"), mount)
      .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+(\/[^"'<\s]*)/g, (_match, path: string) =>
        scopePreviewHref(path || "/", mount),
      ),
    mount,
  );
}

export function rewritePreviewDocument(body: string, artisanPort: number, prefix: string): string {
  const mount = previewMountPrefix(prefix);
  const rewritten = rewriteLoopbackDocuments(body, artisanPort, mount);
  const trimmed = rewritten.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return rewriteInertiaPageJson(rewritten, mount);
  }
  return injectPreviewMetrics(
    injectPreviewWait(injectPreviewScopeScript(rewriteInertiaDataPageScripts(rewritten, mount), mount)),
  );
}

export function rewriteViteLoopbackUrls(code: string, vitePrefix: string): string {
  const prefix = vitePrefix.replace(/\/$/, "");
  const mount = previewMountPrefix(prefix);
  return code.replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+(\/[^"'<\s]*)/gi, (_match, path: string) => {
    if (isViteDevPath(path)) return `${prefix}${path}`;
    return scopePreviewHref(path || "/", mount);
  });
}

export function rewriteViteBareImports(code: string, vitePrefix: string): string {
  const prefix = vitePrefix.replace(/\/$/, "");
  return rewriteLaravelPublicRoots(
    rewriteViteLoopbackUrls(
      code
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
        .replaceAll('"BASE_URL": "/"', `"BASE_URL": "${prefix}/"`),
      prefix,
    ),
    prefix,
  );
}
