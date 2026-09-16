export function rewriteSetCookie(value: string, cookiePath: string): string {
  if (/;\s*path=/i.test(value)) return value.replace(/;\s*path=[^;]*/i, `; Path=${cookiePath}`);
  return `${value}; Path=${cookiePath}`;
}

export function rewriteLocation(location: string, port: number, prefix: string): string {
  return location
    .replaceAll(`http://127.0.0.1:${port}`, prefix)
    .replaceAll(`http://localhost:${port}`, prefix);
}

export function rewritePreviewDocument(body: string, artisanPort: number, prefix: string): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body
    .replaceAll(`http://127.0.0.1:${artisanPort}`, prefix)
    .replaceAll(`http://localhost:${artisanPort}`, prefix)
    .replace(new RegExp(`https?://(?:127\\.0\\.0\\.1|localhost):\\d+${escaped}`, "g"), prefix);
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
