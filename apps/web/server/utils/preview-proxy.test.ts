import { describe, expect, it } from "vitest";
import { viteDevAssetPath } from "@atelier/supervisor";
import { rewriteLocation, rewriteSetCookie } from "./preview-rewrite";

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
});
