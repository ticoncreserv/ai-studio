export const THEME_IDS = ["crimson", "azure", "amber", "violet", "teal", "chalk"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "crimson";

export const THEMES: Record<ThemeId, { swatch: string }> = {
  crimson: { swatch: "#c40000" },
  azure: { swatch: "#4d9bf5" },
  amber: { swatch: "#d97706" },
  violet: { swatch: "#7c5cfc" },
  teal: { swatch: "#0f9d8a" },
  chalk: { swatch: "#c8c2b4" },
};

export function resolveTheme(id: unknown): ThemeId {
  return THEME_IDS.includes(id as ThemeId) ? (id as ThemeId) : DEFAULT_THEME;
}
