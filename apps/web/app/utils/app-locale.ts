export const APP_LOCALE_COOKIE = "atelier-locale";

export type AppLocale = "pt-BR" | "en";

export function resolveAppLocale(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "pt-BR";
}
