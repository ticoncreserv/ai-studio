<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";

const { t, locale, setLocale } = useI18n();
</script>

<template>
  <!-- appearance-none keeps the native widget from painting its own light chrome. -->
  <span class="relative inline-flex items-center">
    <select
      class="login-locale"
      :value="locale"
      :aria-label="t('auth.localeLabel')"
      @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'pt-BR')"
    >
      <option value="pt-BR">{{ t("auth.portuguese") }}</option>
      <option value="en">{{ t("auth.english") }}</option>
    </select>
    <ChevronDown class="pointer-events-none absolute right-1.5 h-3 w-3 text-ink-400" />
  </span>
</template>
