import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_IDS, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("returns crimson when the id is missing or unknown", () => {
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
    expect(resolveTheme(null)).toBe("crimson");
    expect(resolveTheme("")).toBe("crimson");
    expect(resolveTheme("navy")).toBe("crimson");
  });

  it("passes through every known palette id", () => {
    for (const id of THEME_IDS) {
      expect(resolveTheme(id)).toBe(id);
    }
  });
});
