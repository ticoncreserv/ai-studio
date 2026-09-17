import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { viteDevAssetPath } from "@atelier/supervisor";
import { cookieNamed, readPreviewProxyBody } from "./preview-proxy-core";
import { PREVIEW_METRICS_MARK } from "./preview-metrics";
import { injectPreviewWait, PREVIEW_WAIT_ROOT } from "./preview-wait";
import {
  isOrphanLaravelPublicPath,
  orphanLaravelPublicPreviewPath,
  parsePreviewMountPath,
  PREVIEW_TOKEN_COOKIE,
  previewPathnameFromRequest,
  previewTokenCookie,
  previewTokenFromReferer,
  previewWorkspaceIdFromReferer,
  rewriteLocation,
  rewritePreviewDocument,
  rewritePreviewLocation,
  rewriteSetCookie,
  rewriteViteBareImports,
  scopePreviewHref,
  shouldRewriteViteBody,
  shouldStreamPreviewBody,
  viteSearchForAssetModule,
} from "./preview-rewrite";

describe("preview proxy rewrites", () => {
  it("scopes Laravel cookies to the preview prefix", () => {
    expect(rewriteSetCookie("laravel_session=abc; Path=/; HttpOnly", "/-/p/tok")).toBe(
      "laravel_session=abc; Path=/-/p/tok; HttpOnly",
    );
    expect(rewriteSetCookie("XSRF-TOKEN=x", "/-/p/tok")).toBe("XSRF-TOKEN=x; Path=/-/p/tok");
  });

  it("rewrites loopback redirects onto the public preview path", () => {
    expect(rewriteLocation("http://127.0.0.1:45401/login", 45401, "/-/p/tok")).toBe("/-/p/tok/login");
    expect(rewriteLocation("http://127.0.0.1:45410/@vite/client", 45410, "/-/p/tok/__vite")).toBe(
      "/-/p/tok/__vite/@vite/client",
    );
    expect(rewriteLocation("/login", 45401, "/-/p/tok")).toBe("/-/p/tok/login");
    expect(rewritePreviewLocation("http://127.0.0.1:43123/login", 45407, "/-/p/tok", 45408)).toBe(
      "/-/p/tok/login",
    );
    expect(rewritePreviewLocation("http://127.0.0.1:45408/@vite/client", 45407, "/-/p/tok", 45408)).toBe(
      "/-/p/tok/__vite/@vite/client",
    );
    expect(rewritePreviewLocation("/-/p/tok/login", 45407, "/-/p/tok", 45408)).toBe("/-/p/tok/login");
  });

  it("forwards Vite module URLs under the preview prefix", () => {
    expect(viteDevAssetPath("__vite/@vite/client")).toBe("/@vite/client");
    expect(viteDevAssetPath("login")).toBeNull();
  });

  it("keeps Vite imports on the preview origin for localhost and 127.0.0.1", () => {
    expect(
      rewriteViteBareImports(
        `import { createApp } from "/node_modules/.vite/deps/vue.js";\nimport.meta.env = {"BASE_URL": "/"};`,
        "/-/p/tok/__vite",
      ),
    ).toContain('from "/-/p/tok/__vite/node_modules/.vite/deps/vue.js"');
    expect(
      rewritePreviewDocument(
        `<script src="http://127.0.0.1:43123/-/p/tok/__vite/@vite/client"></script><link href="http://127.0.0.1:45403/favicon.png">`,
        45403,
        "/-/p/tok",
      ),
    ).toBe(`<script src="/-/p/tok/__vite/@vite/client"></script><link href="/-/p/tok/favicon.png">`);
  });

  it("keeps Inertia page.url and history under the preview prefix", () => {
    const html = rewritePreviewDocument(
      `<html><head></head><body><script data-page="app" type="application/json">{"component":"auth/Login","props":{},"url":"/login","version":""}</script></body></html>`,
      45407,
      "/-/p/tok",
    );
    expect(html).toContain('"url":"/-/p/tok/login"');
    expect(html).toContain("window.__atelierPreviewScope");
    expect(html).toContain('hostname==="127.0.0.1"');
    expect(html).toContain("/_nuxt/");
    expect(html).toContain("HTMLSourceElement");
    expect(html).toContain("HTMLFormElement");
    expect(html).toContain("src|href|poster|action");
    expect(html).toContain('tagName==="FORM"');
    expect(html).toContain("/-/p/tok");
    expect(scopePreviewHref("/login", "/-/p/tok")).toBe("/-/p/tok/login");
    expect(scopePreviewHref("/-/p/tok/login", "/-/p/tok/__vite")).toBe("/-/p/tok/login");
    expect(
      rewritePreviewDocument(`{"component":"auth/Login","props":{},"url":"\\/login","version":""}`, 45407, "/-/p/tok"),
    ).toContain('"/-/p/tok/login"');
  });

  it("injects a wait overlay into Laravel HTML so the iframe is not blank", () => {
    const html = rewritePreviewDocument(
      `<html><head></head><body><div id="app"></div></body></html>`,
      45407,
      "/-/p/tok",
    );
    expect(html).toContain(`id="${PREVIEW_WAIT_ROOT}"`);
    expect(injectPreviewWait(html)).toBe(html);
    expect(html).toContain("inertia:start");
    expect(html).toContain("atelier-preview-ready");
    expect(html).toContain("Carregando a tela");
    expect(html).toContain(PREVIEW_METRICS_MARK);
    expect(html.indexOf(PREVIEW_WAIT_ROOT)).toBeLessThan(html.indexOf(PREVIEW_METRICS_MARK));
  });

  it("scopes Laravel public /assets URLs onto the preview prefix, not Vite", () => {
    const js = rewriteViteBareImports(
      `const authBgVideo = '/assets/videos/visualizer_concreserv_1080p.mp4';`,
      "/-/p/tok/__vite",
    );
    expect(js).toContain("'/-/p/tok/assets/videos/visualizer_concreserv_1080p.mp4'");
    expect(js).not.toContain("/-/p/tok/__vite/assets/");
    expect(
      rewritePreviewDocument(
        `<source src="/assets/videos/visualizer_concreserv_1080p.mp4" type="video/mp4">`,
        45407,
        "/-/p/tok",
      ),
    ).toContain('src="/-/p/tok/assets/videos/visualizer_concreserv_1080p.mp4"');
    expect(
      rewriteViteBareImports(
        `export default "http://127.0.0.1:45415/resources/images/logo_concreserv.png"`,
        "/-/p/tok/__vite",
      ),
    ).toBe(`export default "/-/p/tok/__vite/resources/images/logo_concreserv.png"`);
    expect(
      rewriteViteBareImports(
        `export default "http://127.0.0.1:45415/assets/images/truck.jpg"`,
        "/-/p/tok/__vite",
      ),
    ).toBe(`export default "/-/p/tok/assets/images/truck.jpg"`);
    expect(previewTokenFromReferer("https://studio.local/-/p/tok/login")).toBe("tok");
    expect(
      previewTokenFromReferer(
        "https://studio.local/_nuxt/@fs/__skip_vite/-/p/tok/__vite/resources/js/layouts/AuthLayout.vue",
      ),
    ).toBe("tok");
    expect(
      previewTokenFromReferer("https://studio.local/__skip_vite/-/p/tok/__vite/resources/images/filial.png"),
    ).toBe("tok");
    expect(previewTokenFromReferer("https://studio.local/w/abc")).toBeNull();
    expect(previewWorkspaceIdFromReferer("https://studio.local/w/abc-def")).toBe("abc-def");
    expect(previewWorkspaceIdFromReferer("https://studio.local/w/abc-def?tab=chat")).toBe("abc-def");
    expect(previewWorkspaceIdFromReferer("https://studio.local/-/p/tok/login")).toBeNull();
    expect(previewTokenCookie("tok")).toBe(`${PREVIEW_TOKEN_COOKIE}=tok; Path=/; SameSite=Lax`);
    expect(cookieNamed("atelier-locale=pt-BR; atelier-preview-token=tok", PREVIEW_TOKEN_COOKIE)).toBe("tok");
    expect(
      viteSearchForAssetModule(
        "/_nuxt/@fs/__skip_vite/-/p/tok/__vite/resources/images/filial.png",
        "",
        "__vite/resources/images/filial.png",
        "script",
      ),
    ).toBe("?import");
    expect(
      viteSearchForAssetModule(
        "/_nuxt/@fs/__skip_vite/resources/images/logo_concreserv.png",
        "",
        "resources/images/logo_concreserv.png",
        "script",
      ),
    ).toBe("?import");
    expect(
      viteSearchForAssetModule(
        "/_nuxt/@fs/__skip_vite/-/p/tok/__vite/resources/images/filial.png",
        "",
        "__vite/resources/images/filial.png",
        "image",
      ),
    ).toBe("");
    expect(
      viteSearchForAssetModule(
        "/-/p/tok/__vite/resources/images/filial.png",
        "?import",
        "__vite/resources/images/filial.png",
        "script",
      ),
    ).toBe("?import");
    expect(isOrphanLaravelPublicPath("/assets/videos/visualizer_concreserv_1080p.mp4")).toBe(true);
    expect(isOrphanLaravelPublicPath("/assets/images/logo_concreserv.png")).toBe(true);
    expect(isOrphanLaravelPublicPath("/resources/images/filial.png")).toBe(true);
    expect(isOrphanLaravelPublicPath("/_nuxt/@fs/__skip_vite/resources/images/filial.png")).toBe(true);
    expect(isOrphanLaravelPublicPath("/__skip_vite/assets/videos/visualizer_concreserv_1080p.mp4")).toBe(true);
    expect(isOrphanLaravelPublicPath("/_nuxt/@fs/__skip_vite/-/p/tok/__vite/resources/images/filial.png")).toBe(false);
    expect(isOrphanLaravelPublicPath("/assets/css/main.css")).toBe(false);
    expect(orphanLaravelPublicPreviewPath("/assets/images/logo_concreserv.png", "tok")).toBe(
      "/-/p/tok/assets/images/logo_concreserv.png",
    );
    expect(orphanLaravelPublicPreviewPath("/_nuxt/@fs/__skip_vite/resources/images/filial.png", "tok")).toBe(
      "/-/p/tok/resources/images/filial.png",
    );
    expect(shouldStreamPreviewBody("video/mp4", "assets/videos/visualizer_concreserv_1080p.mp4")).toBe(true);
    expect(shouldStreamPreviewBody("text/javascript", "resources/js/app.ts")).toBe(false);
    expect(shouldRewriteViteBody("image/png", "?import", "/resources/images/logo_concreserv.png")).toBe(true);
    expect(shouldRewriteViteBody("image/png", "", "/resources/images/logo_concreserv.png")).toBe(false);
    expect(parsePreviewMountPath("/-/p/tok/__vite/resources/images/logo_concreserv.png")).toEqual({
      token: "tok",
      rest: "__vite/resources/images/logo_concreserv.png",
    });
    expect(previewPathnameFromRequest("/__skip_vite/-/p/tok/__vite/resources/images/logo_concreserv.png")).toBe(
      "/-/p/tok/__vite/resources/images/logo_concreserv.png",
    );
    expect(
      parsePreviewMountPath("/_nuxt/@fs/__skip_vite/-/p/tok/__vite/resources/images/logo_concreserv.png"),
    ).toEqual({
      token: "tok",
      rest: "__vite/resources/images/logo_concreserv.png",
    });
  });

  it("forwards POST bodies on the Node preview proxy used in nuxt dev", async () => {
    const payload = JSON.stringify({ email: "user@example.com", password: "secret" });
    const req = Readable.from([payload]) as IncomingMessage;
    expect(await readPreviewProxyBody(req, "POST")).toEqual(Buffer.from(payload));
    expect(await readPreviewProxyBody(Readable.from(["ignored"]) as IncomingMessage, "GET")).toBeUndefined();
    expect(await readPreviewProxyBody(Readable.from([]) as IncomingMessage, "HEAD")).toBeUndefined();
  });
});
