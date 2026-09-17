import { describe, expect, it } from "vitest";
import {
  STUDIO_CHAT_PX,
  STUDIO_RAIL_PX,
  STUDIO_SPLIT_PX,
  resolveSidebarOpen,
  resolveStudioRailOpen,
  sidebarOpenByDefault,
  sidebarOverrideFromStorage,
  sidebarStorageValue,
  sidebarVisibilityClass,
  studioChatColumnWidth,
  studioChatOverlays,
  studioRailOverlays,
  studioShowsSessionRail,
} from "./studio-layout";

describe("studio split layout", () => {
  it("hides the chat column below the split and shows it from 900px up", () => {
    expect(sidebarOpenByDefault(STUDIO_SPLIT_PX - 1)).toBe(false);
    expect(sidebarOpenByDefault(STUDIO_SPLIT_PX)).toBe(true);
    expect(sidebarVisibilityClass(null)).toBe("hidden min-[900px]:flex");
  });

  it("lets an explicit toggle override the responsive default", () => {
    expect(sidebarVisibilityClass(true)).toBe("flex");
    expect(sidebarVisibilityClass(false)).toBe("hidden");
    expect(resolveSidebarOpen(true, 800)).toBe(true);
    expect(resolveSidebarOpen(false, 1400)).toBe(false);
    expect(resolveSidebarOpen(null, 800)).toBe(false);
    expect(resolveSidebarOpen(null, 1400)).toBe(true);
  });

  it("treats stored open on a narrow pane as a drawer, not a clipping split", () => {
    expect(resolveSidebarOpen(true, 800)).toBe(true);
    expect(studioChatOverlays(800)).toBe(true);
    expect(studioChatOverlays(STUDIO_SPLIT_PX)).toBe(false);
  });

  it("keeps the chat column at 392px once split, and full width on mobile", () => {
    expect(STUDIO_CHAT_PX).toBe(392);
    expect(studioChatColumnWidth(STUDIO_SPLIT_PX - 1)).toBe("full");
    expect(studioChatColumnWidth(STUDIO_SPLIT_PX)).toBe(STUDIO_CHAT_PX);
    expect(studioChatColumnWidth(1600)).toBe(STUDIO_CHAT_PX);
  });

  it("docks the session rail from 1200px and overlays below that", () => {
    expect(studioShowsSessionRail(STUDIO_SPLIT_PX)).toBe(false);
    expect(studioShowsSessionRail(STUDIO_RAIL_PX - 1)).toBe(false);
    expect(studioShowsSessionRail(STUDIO_RAIL_PX)).toBe(true);
    expect(studioRailOverlays(STUDIO_RAIL_PX - 1)).toBe(true);
    expect(studioRailOverlays(STUDIO_RAIL_PX)).toBe(false);
  });

  it("lets the docked rail collapse while the overlay toggle still applies below 1200px", () => {
    expect(resolveStudioRailOpen(false, STUDIO_RAIL_PX)).toBe(true);
    expect(resolveStudioRailOpen(false, STUDIO_RAIL_PX, true)).toBe(false);
    expect(resolveStudioRailOpen(false, STUDIO_RAIL_PX - 1)).toBe(false);
    expect(resolveStudioRailOpen(true, 800)).toBe(true);
    expect(resolveStudioRailOpen(true, 800, true)).toBe(true);
  });

  it("round-trips the session storage flag", () => {
    expect(sidebarOverrideFromStorage(null)).toBeNull();
    expect(sidebarOverrideFromStorage("nope")).toBeNull();
    expect(sidebarOverrideFromStorage("open")).toBe(true);
    expect(sidebarOverrideFromStorage("closed")).toBe(false);
    expect(sidebarStorageValue(true)).toBe("open");
    expect(sidebarStorageValue(false)).toBe("closed");
  });
});
