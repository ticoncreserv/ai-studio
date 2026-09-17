import { describe, expect, it } from "vitest";
import {
  COMPOSER_LINE_PX,
  COMPOSER_MAX_PX,
  COMPOSER_PLUS_PX,
  composerCompactFieldWidth,
  composerFieldHeight,
  composerNeedsExpanded,
} from "./composer-layout";

describe("composer layout", () => {
  it("stays compact for a single line of text", () => {
    expect(composerNeedsExpanded("", COMPOSER_LINE_PX)).toBe(false);
    expect(composerNeedsExpanded("Where to next?", COMPOSER_LINE_PX)).toBe(false);
    expect(composerNeedsExpanded("Where to next?", COMPOSER_LINE_PX + 2)).toBe(false);
  });

  it("expands on an explicit line break even if the field is still one line tall", () => {
    expect(composerNeedsExpanded("hello\n", COMPOSER_LINE_PX)).toBe(true);
    expect(composerNeedsExpanded("a\nb", COMPOSER_LINE_PX * 2)).toBe(true);
  });

  it("expands when compact width wraps, so the field can take the full row", () => {
    expect(composerNeedsExpanded("a long prompt without breaks", COMPOSER_LINE_PX * 2)).toBe(true);
  });

  it("clamps the field between one line and the composer max", () => {
    expect(composerFieldHeight(10)).toBe(COMPOSER_LINE_PX);
    expect(composerFieldHeight(80)).toBe(80);
    expect(composerFieldHeight(400)).toBe(COMPOSER_MAX_PX);
  });

  it("reserves the plus control, end cluster, and gutters for compact width", () => {
    expect(composerCompactFieldWidth(400, 16, 8, 56)).toBe(400 - 16 - COMPOSER_PLUS_PX - 16 - 56);
    expect(composerCompactFieldWidth(400, 16, 8, 56, COMPOSER_PLUS_PX, 72)).toBe(400 - 16 - COMPOSER_PLUS_PX - 16 - 56 - 72 - 6);
    expect(composerCompactFieldWidth(80, 16, 8, 56)).toBe(0);
  });
});
