import { describe, expect, it } from "vitest";
import { absoluteAppUrl, fetchStatusCode } from "./studio-link";

describe("studio link", () => {
  it("joins origin and a relative path", () => {
    expect(absoluteAppUrl("http://localhost:43123", "/invite/abc")).toBe("http://localhost:43123/invite/abc");
    expect(absoluteAppUrl("http://localhost:43123/", "share/tok")).toBe("http://localhost:43123/share/tok");
  });

  it("keeps an already-absolute URL", () => {
    expect(absoluteAppUrl("http://localhost:43123", "https://example.test/share/x")).toBe("https://example.test/share/x");
  });

  it("reads fetch status codes from ofetch-shaped errors", () => {
    expect(fetchStatusCode({ statusCode: 403 })).toBe(403);
    expect(fetchStatusCode({ status: 401 })).toBe(401);
    expect(fetchStatusCode("nope")).toBeUndefined();
  });
});
