<script setup lang="ts">
import nameUrl from "~/assets/wordmark-name.png?url";
import taglineUrl from "~/assets/wordmark-tagline.png?url";

const { t } = useI18n();
</script>

<template>
  <span
    class="login-mark"
    role="img"
    :aria-label="t('app.company')"
    :style="{
      '--login-wordmark-name': `url('${nameUrl}')`,
      '--login-wordmark-tagline': `url('${taglineUrl}')`,
    }"
  >
    <span class="login-wordmark-name" aria-hidden="true" />
    <span class="login-wordmark-tagline" aria-hidden="true" />
  </span>
</template>

<style scoped>
/* Official lockup as two CSS masks so CONCRESERV follows currentColor and the tagline stays ink. */
.login-wordmark-name,
.login-wordmark-tagline {
  display: block;
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}

.login-wordmark-name {
  background-color: currentColor;
  -webkit-mask-image: var(--login-wordmark-name);
  mask-image: var(--login-wordmark-name);
  filter: drop-shadow(0 0 16px rgb(var(--color-coral-rgb) / 0.38));
}

.login-wordmark-tagline {
  background-color: var(--color-ink-950);
  -webkit-mask-image: var(--login-wordmark-tagline);
  mask-image: var(--login-wordmark-tagline);
}
</style>
