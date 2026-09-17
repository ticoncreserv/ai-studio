export type PreviewFrameUnavailable = "hibernated" | "down" | "missing";

/** Must match `PREVIEW_WAIT_ROOT` in the preview-unavailable document. */
export const PREVIEW_WAIT_ROOT_ID = "atelier-preview-wait";

export function previewUnavailableFromDocument(doc: Document | null | undefined): PreviewFrameUnavailable | null {
  const root = doc?.getElementById(PREVIEW_WAIT_ROOT_ID);
  if (!root || root.getAttribute("data-phase") !== "error") return null;
  const reason = root.getAttribute("data-reason");
  if (reason === "hibernated" || reason === "down" || reason === "missing") return reason;
  return "down";
}
