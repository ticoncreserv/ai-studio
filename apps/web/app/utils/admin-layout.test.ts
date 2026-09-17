import { describe, expect, it } from "vitest";
import {
  ADMIN_RAIL_PX,
  adminRailOpenByDefault,
  adminRailOverlays,
  resolveAdminRailOpen,
} from "./admin-layout";

describe("admin rail layout", () => {
  it("docks the rail from 1024px and overlays below that", () => {
    expect(adminRailOverlays(ADMIN_RAIL_PX - 1)).toBe(true);
    expect(adminRailOverlays(ADMIN_RAIL_PX)).toBe(false);
    expect(adminRailOpenByDefault(ADMIN_RAIL_PX - 1)).toBe(false);
    expect(adminRailOpenByDefault(ADMIN_RAIL_PX)).toBe(true);
  });

  it("stays closed by default on a narrow pane and open when docked", () => {
    expect(resolveAdminRailOpen(false, 375)).toBe(false);
    expect(resolveAdminRailOpen(false, 768)).toBe(false);
    expect(resolveAdminRailOpen(false, ADMIN_RAIL_PX)).toBe(true);
    expect(resolveAdminRailOpen(false, 1280)).toBe(true);
  });

  it("lets the mobile toggle open the overlay without hiding the desktop rail", () => {
    expect(resolveAdminRailOpen(true, 375)).toBe(true);
    expect(resolveAdminRailOpen(true, ADMIN_RAIL_PX - 1)).toBe(true);
    expect(resolveAdminRailOpen(true, ADMIN_RAIL_PX)).toBe(true);
    expect(resolveAdminRailOpen(false, ADMIN_RAIL_PX)).toBe(true);
  });
});
