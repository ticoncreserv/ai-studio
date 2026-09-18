import { describe, expect, it } from "vitest";
import {
  adminLoginsFromEnv,
  canCreateStudioInvite,
  canInvite,
  FALLBACK_REPO_OWNER_LOGIN,
  isPermanentPlatformAdmin,
  isPlatformAdmin,
  mapGitHubPermission,
} from "./authz.js";

describe("studio invite permission", () => {
  it("lets editors and platform admins create invites, not viewers", () => {
    expect(canInvite("owner")).toBe(true);
    expect(canInvite("editor")).toBe(false);
    expect(canInvite("viewer")).toBe(false);
    expect(canCreateStudioInvite("owner")).toBe(true);
    expect(canCreateStudioInvite("editor")).toBe(true);
    expect(canCreateStudioInvite("viewer")).toBe(false);
    expect(canCreateStudioInvite("viewer", true)).toBe(true);
  });
});

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

  it("treats a regular signed-in user as not admin", () => {
    expect(isPlatformAdmin({ login: "bob", role: "editor" })).toBe(false);
    expect(isPlatformAdmin({ login: "ana", role: "owner" })).toBe(false);
    expect(isPlatformAdmin({ login: "ana", role: "owner", platformAdmin: false }, { hasExplicitAdmin: false })).toBe(
      false,
    );
  });

  it("treats ticoncreserv as admin even if platformAdmin is false or undefined", () => {
    const owner = { login: FALLBACK_REPO_OWNER_LOGIN, role: "viewer" as const, platformAdmin: false };
    expect(isPlatformAdmin(owner)).toBe(true);
    expect(isPlatformAdmin({ login: "ticoncreserv", role: "editor" })).toBe(true);
    expect(
      isPlatformAdmin(
        { login: "TiconCreserv", role: "editor", platformAdmin: false },
        { repoOwnerLogin: "ticoncreserv" },
      ),
    ).toBe(true);
    expect(isPermanentPlatformAdmin("ticoncreserv")).toBe(true);
    expect(isPermanentPlatformAdmin("TiconCreserv", "ticoncreserv")).toBe(true);
  });

  it("does not treat another GitHub owner as admin without an explicit flag", () => {
    expect(isPlatformAdmin({ login: "ana", role: "owner" }, { repoOwnerLogin: "ticoncreserv" })).toBe(false);
    expect(
      isPlatformAdmin({ login: "ada", role: "owner", platformAdmin: false }, { repoOwnerLogin: "ada" }),
    ).toBe(false);
    expect(isPermanentPlatformAdmin("ada", "ada")).toBe(false);
    expect(isPlatformAdmin({ login: "ada", role: "owner", platformAdmin: true }, { repoOwnerLogin: "ada" })).toBe(true);
  });

  it("honors the platformAdmin bit and env allow-list", () => {
    expect(isPlatformAdmin({ login: "bob", role: "editor", platformAdmin: true })).toBe(true);
    expect(isPlatformAdmin({ login: "tic", role: "viewer" }, { envLogins: ["tic"] })).toBe(true);
  });
});
