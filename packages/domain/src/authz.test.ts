import { describe, expect, it } from "vitest";
import { mapGitHubPermission } from "./authz.js";

describe("github permission mapping", () => {
  it("maps admin to owner and push to editor", () => {
    expect(mapGitHubPermission({ admin: true })).toBe("owner");
    expect(mapGitHubPermission({ push: true, pull: true })).toBe("editor");
    expect(mapGitHubPermission({ pull: true })).toBe("viewer");
    expect(mapGitHubPermission({})).toBe(null);
  });
});
