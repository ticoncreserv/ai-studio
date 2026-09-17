import type { PreviewTool } from "~/types/studio";

export const STUDIO_SHORTCUTS = [
  { id: "prompt", keys: "⌘K", labelKey: "command.prompt" },
  { id: "cancel", keys: "⌘.", labelKey: "command.cancel" },
  { id: "mobile", keys: "⌘1", labelKey: "command.viewportMobile" },
  { id: "tablet", keys: "⌘2", labelKey: "command.viewportTablet" },
  { id: "desktop", keys: "⌘3", labelKey: "command.viewportDesktop" },
  { id: "shortcuts", keys: "⌘/", labelKey: "command.shortcuts" },
] as const;

/** ESC leaves inspect for the default select pointer. */
export function previewToolAfterEscape(tool: PreviewTool): PreviewTool {
  return tool === "inspect" ? "select" : tool;
}
