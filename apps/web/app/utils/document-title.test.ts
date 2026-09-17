import { describe, expect, it } from "vitest";
import { documentTitleKind } from "./document-title";

describe("documentTitleKind", () => {
  it("uses the home title on the landing page", () => {
    expect(documentTitleKind("/")).toBe("home");
  });

  it("uses the studio title on workspace routes", () => {
    expect(documentTitleKind("/w/002c5cdb-0d8e-4483-8c7b-a611b9b658ed")).toBe("studio");
  });

  it("uses the admin title on the admin panel", () => {
    expect(documentTitleKind("/admin")).toBe("admin");
    expect(documentTitleKind("/admin/")).toBe("admin");
  });
});
