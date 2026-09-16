import { describe, expect, it } from "vitest";
import { viteDevAssetPath } from "@atelier/supervisor";
import { injectPreviewWait, PREVIEW_WAIT_ROOT } from "./preview-wait";
import {
  rewriteLocation,
  rewritePreviewDocument,
  rewritePreviewLocation,
  rewriteSetCookie,
  rewriteViteBareImports,
  scopePreviewHref,
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
  });
});
