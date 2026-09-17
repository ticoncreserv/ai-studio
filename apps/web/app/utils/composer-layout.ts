/** One composer line: 20px leading plus 1px/3px field padding. */
export const COMPOSER_LINE_PX = 24;
export const COMPOSER_MAX_PX = 132;
export const COMPOSER_PLUS_PX = 24;

/** Subpixel scrollHeight on a single line can read a couple of pixels tall. */
const LINE_SLACK_PX = 4;

export function composerNeedsExpanded(value: string, heightAtCompactWidth: number): boolean {
  if (value.includes("\n")) return true;
  return heightAtCompactWidth > COMPOSER_LINE_PX + LINE_SLACK_PX;
}

export function composerFieldHeight(contentHeight: number): number {
  return Math.max(COMPOSER_LINE_PX, Math.min(contentHeight, COMPOSER_MAX_PX));
}

/** Width the field would have with plus/end controls on the same row. */
export function composerCompactFieldWidth(
  rowClientWidth: number,
  paddingX: number,
  columnGap: number,
  endWidth: number,
  plusWidth = COMPOSER_PLUS_PX,
  tokenWidth = 0,
): number {
  const tokenGap = tokenWidth > 0 ? 6 : 0;
  return Math.max(0, rowClientWidth - paddingX - plusWidth - columnGap * 2 - endWidth - tokenWidth - tokenGap);
}
