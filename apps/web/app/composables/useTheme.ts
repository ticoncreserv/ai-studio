import { DEFAULT_THEME, THEME_IDS, resolveTheme, type ThemeId } from "~/utils/theme";

export function useTheme() {
  const cookie = useCookie<string>("atelier-theme", {
    default: () => DEFAULT_THEME,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    path: "/",
  });

  const current = computed(() => resolveTheme(cookie.value));

  function setTheme(id: ThemeId) {
    cookie.value = id;
  }

  if (import.meta.client) {
    watch(
      current,
      (id) => {
        document.documentElement.dataset.theme = id;
      },
      { immediate: true },
    );
  }

  return { current, setTheme, themes: THEME_IDS };
}
