export function useRelativeTime() {
  const { t, locale } = useI18n();
  return (iso: string) => {
    const delta = Date.now() - new Date(iso).getTime();
    if (delta < 60_000) return t("time.justNow");
    if (delta < 3600_000) return t("time.minutesAgo", { count: Math.floor(delta / 60_000) });
    if (delta < 86_400_000) return t("time.hoursAgo", { count: Math.floor(delta / 3600_000) });
    return new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  };
}
