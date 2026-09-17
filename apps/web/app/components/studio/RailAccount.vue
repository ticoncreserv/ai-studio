<script setup lang="ts">
const props = defineProps<{
  login: string;
  platformAdmin?: boolean;
}>();

const { t } = useI18n();

const initial = computed(() => (props.login || "?").slice(0, 1).toUpperCase());
</script>

<template>
  <div class="cx-rail-account" role="group" :aria-label="t('nav.account')">
    <div class="cx-rail-lockup">
      <NuxtLink
        v-if="platformAdmin"
        to="/admin"
        class="cx-rail-identity cx-rail-identity-link"
        :aria-label="t('nav.admin')"
        :title="t('nav.admin')"
      >
        <span class="cx-rail-mark" aria-hidden="true">{{ initial }}</span>
        <span class="cx-rail-login" :title="login">{{ login }}</span>
      </NuxtLink>
      <div v-else class="cx-rail-identity">
        <span class="cx-rail-mark" aria-hidden="true">{{ initial }}</span>
        <span class="cx-rail-login" :title="login">{{ login }}</span>
      </div>
      <div class="cx-rail-tools">
        <StudioAccountMenu />
      </div>
    </div>
  </div>
</template>
