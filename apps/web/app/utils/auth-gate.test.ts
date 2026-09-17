import { describe, expect, it } from "vitest";
import {
  isAuthExemptRequestPath,
  isPublicStudioPath,
  shouldRedirectUnauthenticatedToHome,
} from "./auth-gate";

describe("auth gate", () => {
  it("keeps the home, share, invite, and GitHub setup pages public", () => {
    expect(isPublicStudioPath("/")).toBe(true);
    expect(isPublicStudioPath("/share/abc")).toBe(true);
    expect(isPublicStudioPath("/invite/token")).toBe(true);
    expect(isPublicStudioPath("/setup/github")).toBe(true);
    expect(isPublicStudioPath("/setup/github/callback")).toBe(true);
  });

  it("requires a session for workspace, admin, and other studio pages", () => {
    expect(isPublicStudioPath("/w/002c5cdb-0d8e-4483-8c7b-a611b9b658ed")).toBe(false);
    expect(isPublicStudioPath("/admin")).toBe(false);
    expect(isPublicStudioPath("/pending")).toBe(false);
    expect(isPublicStudioPath("/disabled")).toBe(false);
  });

  it("does not send APIs, preview, or Vite through the login redirect", () => {
    expect(isAuthExemptRequestPath("/api/me")).toBe(true);
    expect(isAuthExemptRequestPath("/-/p/tok/login")).toBe(true);
    expect(isAuthExemptRequestPath("/_nuxt/entry.js")).toBe(true);
    expect(isAuthExemptRequestPath("/auth/github")).toBe(true);
    expect(isAuthExemptRequestPath("/assets/css/main.css")).toBe(true);
  });

  it("sends guests on protected URLs to home and leaves signed-in users in place", () => {
    expect(shouldRedirectUnauthenticatedToHome("/w/abc", false)).toBe(true);
    expect(shouldRedirectUnauthenticatedToHome("/admin", false)).toBe(true);
    expect(shouldRedirectUnauthenticatedToHome("/pending", false)).toBe(true);
    expect(shouldRedirectUnauthenticatedToHome("/", false)).toBe(false);
    expect(shouldRedirectUnauthenticatedToHome("/share/x", false)).toBe(false);
    expect(shouldRedirectUnauthenticatedToHome("/w/abc", true)).toBe(false);
    expect(shouldRedirectUnauthenticatedToHome("/admin", true)).toBe(false);
    expect(shouldRedirectUnauthenticatedToHome("/api/me", false)).toBe(false);
  });
});
