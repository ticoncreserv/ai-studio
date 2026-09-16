import { describe, expect, it } from "vitest";
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
  });
});
