/** Below this, chat overlays the preview instead of splitting. */
export const STUDIO_SPLIT_PX = 900;

/** Session rail docks from this width; below it, the rail overlays. */
export const STUDIO_RAIL_PX = 1200;

/** Conversation column width once the studio splits. */
export const STUDIO_CHAT_PX = 392;

export const SIDEBAR_STORAGE_KEY = "atelier.studio.sidebar";
export const RAIL_STORAGE_KEY = "atelier.studio.rail";

/** `null` follows the responsive default: hidden below the split, open above. */
export type SidebarOverride = boolean | null;

export function sidebarVisibilityClass(override: SidebarOverride): string {
  if (override === true) return "flex";
  if (override === false) return "hidden";
  return "hidden min-[900px]:flex";
}

export function sidebarOverrideFromStorage(raw: string | null): SidebarOverride {
  if (raw === "open") return true;
  if (raw === "closed") return false;
  return null;
}

export function sidebarStorageValue(open: boolean): "open" | "closed" {
  return open ? "open" : "closed";
}

export function sidebarOpenByDefault(viewportWidth: number): boolean {
  return viewportWidth >= STUDIO_SPLIT_PX;
}

export function resolveSidebarOpen(override: SidebarOverride, viewportWidth: number): boolean {
  if (override !== null) return override;
  return sidebarOpenByDefault(viewportWidth);
}

/** Stored "open" on a narrow pane is a drawer, not a split that clips the preview. */
export function studioChatOverlays(viewportWidth: number): boolean {
  return viewportWidth < STUDIO_SPLIT_PX;
}

export function studioChatColumnWidth(viewportWidth: number): number | "full" {
  return studioChatOverlays(viewportWidth) ? "full" : STUDIO_CHAT_PX;
}

export function studioRailOverlays(viewportWidth: number): boolean {
  return viewportWidth < STUDIO_RAIL_PX;
}

/** Docked session rail — not the overlay drawer. */
export function studioShowsSessionRail(viewportWidth: number): boolean {
  return viewportWidth >= STUDIO_RAIL_PX;
}

export function studioRailOpenByDefault(viewportWidth: number): boolean {
  return viewportWidth >= STUDIO_RAIL_PX;
}

/** Overlay follows `overlayOpen`. Docked rail stays open unless the user collapsed it. */
export function resolveStudioRailOpen(
  overlayOpen: boolean,
  viewportWidth: number,
  dockedClosed = false,
): boolean {
  if (studioRailOverlays(viewportWidth)) return overlayOpen;
  return !dockedClosed;
}
