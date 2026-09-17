/** Below this, the admin rail overlays content instead of docking. */
export const ADMIN_RAIL_PX = 1024;

export function adminRailOverlays(viewportWidth: number): boolean {
  return viewportWidth < ADMIN_RAIL_PX;
}

export function adminRailOpenByDefault(viewportWidth: number): boolean {
  return viewportWidth >= ADMIN_RAIL_PX;
}

/** Desktop is always docked open. The toggle only applies while overlaying. */
export function resolveAdminRailOpen(mobileOpen: boolean, viewportWidth: number): boolean {
  if (!adminRailOverlays(viewportWidth)) return true;
  return mobileOpen;
}
