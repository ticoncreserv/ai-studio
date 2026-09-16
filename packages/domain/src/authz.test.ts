import { describe, expect, it } from "vitest";
import { adminLoginsFromEnv, FALLBACK_REPO_OWNER_LOGIN, isPlatformAdmin, mapGitHubPermission } from "./authz.js";

describe("github permission mapping", () => {
  it("maps admin to owner and push to editor", () => {
    expect(mapGitHubPermission({ admin: true })).toBe("owner");
    expect(mapGitHubPermission({ push: true, pull: true })).toBe("editor");
    expect(mapGitHubPermission({ pull: true })).toBe("viewer");
    expect(mapGitHubPermission({})).toBe(null);
  });
});

describe("platform admin", () => {
  it("parses ATELIER_ADMIN_LOGINS", () => {
    expect(adminLoginsFromEnv({ ATELIER_ADMIN_LOGINS: " tic, ana , " })).toEqual(["tic", "ana"]);
  });

  it("bootstraps GitHub role owners until an explicit admin exists", () => {
    const owner = { login: "ana", role: "owner" as const };
    const editor = { login: "bob", role: "editor" as const };
    expect(isPlatformAdmin(owner, { hasExplicitAdmin: false })).toBe(true);
    expect(isPlatformAdmin(editor, { hasExplicitAdmin: false })).toBe(false);
    expect(isPlatformAdmin(owner, { hasExplicitAdmin: true })).toBe(false);
  });

  it("always treats the GitHub repository owner as admin", () => {
    const owner = { login: FALLBACK_REPO_OWNER_LOGIN, role: "viewer" as const, platformAdmin: false };
    expect(isPlatformAdmin(owner, { hasExplicitAdmin: true })).toBe(true);
    expect(isPlatformAdmin(owner, { hasExplicitAdmin: false })).toBe(true);
    expect(
      isPlatformAdmin(
        { login: "TiconCreserv", role: "editor", platformAdmin: false },
        { hasExplicitAdmin: true, repoOwnerLogin: "ticoncreserv" },
      ),
    ).toBe(true);
    expect(
      isPlatformAdmin({ login: "ana", role: "owner" }, { hasExplicitAdmin: true, repoOwnerLogin: "ticoncreserv" }),
    ).toBe(false);
    expect(
      isPlatformAdmin(
        { login: "ada", role: "viewer", platformAdmin: false },
        { hasExplicitAdmin: true, repoOwnerLogin: "ada" },
      ),
    ).toBe(true);
  });

  it("honors the platformAdmin bit and env allow-list", () => {
    expect(isPlatformAdmin({ login: "bob", role: "editor", platformAdmin: true }, { hasExplicitAdmin: true })).toBe(true);
    expect(
      isPlatformAdmin({ login: "tic", role: "viewer" }, { hasExplicitAdmin: true, envLogins: ["tic"] }),
    ).toBe(true);
  });
});
