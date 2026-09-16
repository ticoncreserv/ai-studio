import { describe, expect, it } from "vitest";
import { viteDevAssetPath } from "@atelier/supervisor";
import { rewriteLocation, rewritePreviewDocument, rewriteSetCookie, rewriteViteBareImports } from "./preview-rewrite";

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
});
