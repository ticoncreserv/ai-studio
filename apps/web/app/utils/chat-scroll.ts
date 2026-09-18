/** Distance from the end of the transcript that still counts as "following" live output. */
export const CHAT_NEAR_BOTTOM_PX = 96;

export function isChatNearBottom(
  box: { scrollTop: number; scrollHeight: number; clientHeight: number },
  thresholdPx = CHAT_NEAR_BOTTOM_PX,
): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= thresholdPx;
}
