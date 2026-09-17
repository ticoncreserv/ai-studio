import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS, adminSectionQuery, parseAdminSection } from "./admin-section";

describe("admin section query", () => {
  it("reads a known tab from the query string", () => {
    expect(parseAdminSection("users")).toBe("users");
    expect(parseAdminSection("flags")).toBe("flags");
  });

  it("falls back to overview when the tab is missing or unknown", () => {
    expect(parseAdminSection(undefined)).toBe("overview");
    expect(parseAdminSection("")).toBe("overview");
    expect(parseAdminSection("not-a-tab")).toBe("overview");
    expect(parseAdminSection(["bogus", "users"])).toBe("overview");
  });

  it("uses the first value when the router repeats the param", () => {
    expect(parseAdminSection(["mcp", "env"])).toBe("mcp");
  });

  it("omits the default tab from the URL and keeps the others shareable", () => {
    expect(adminSectionQuery("overview")).toEqual({});
    expect(adminSectionQuery("providers")).toEqual({ tab: "providers" });
  });

  it("covers every nav section id", () => {
    expect(ADMIN_SECTIONS).toContain("overview");
    for (const id of ADMIN_SECTIONS) {
      expect(parseAdminSection(id)).toBe(id);
    }
  });
});
