<script setup lang="ts">
const { locale } = useI18n();
const { current: theme } = useTheme();
useHead({
  htmlAttrs: { lang: locale, "data-theme": theme },
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
