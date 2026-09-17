<script setup lang="ts">
import { documentTitleKind } from "~/utils/document-title";

const { locale, t } = useI18n();
const { current: theme } = useTheme();
const route = useRoute();

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
