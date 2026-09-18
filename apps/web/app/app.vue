<script setup lang="ts">
import { documentTitleKind } from "~/utils/document-title";
import { APP_LOCALE_COOKIE, resolveAppLocale } from "~/utils/app-locale";

const { locale, setLocale, t } = useI18n();
const { current: theme } = useTheme();
const route = useRoute();
const localeCookie = useCookie<string>(APP_LOCALE_COOKIE, {
  path: "/",
  sameSite: "lax",
});

const resolved = resolveAppLocale(localeCookie.value);
if (localeCookie.value !== resolved) localeCookie.value = resolved;
if (locale.value !== resolved) void setLocale(resolved);
watch(locale, (next) => {
  localeCookie.value = resolveAppLocale(next);
});

useHead({
  htmlAttrs: { lang: locale, "data-theme": theme },
  title: () => t(`app.documentTitle.${documentTitleKind(route.path)}`),
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
