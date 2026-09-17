<script setup lang="ts">
const props = defineProps<{ login: string }>();

const { t } = useI18n();

const initial = computed(() => (props.login || "?").slice(0, 1).toUpperCase());
</script>

<template>
  <div class="cx-rail-account" role="group" :aria-label="t('nav.account')">
    <div class="cx-rail-lockup">
      <div class="cx-rail-identity">
        <span class="cx-rail-mark" aria-hidden="true">{{ initial }}</span>
        <span class="cx-rail-login" :title="login">{{ login }}</span>
      </div>
      <div class="cx-rail-tools">
        <AuthLoginLocale placement="up" />
        <ThemeSwatches placement="up" />
      </div>
    </div>
  </div>
</template>
