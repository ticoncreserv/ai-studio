import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@nuxtjs/tailwindcss", "@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],
  alias: {
    "@atelier/supervisor": fileURLToPath(new URL("../../services/supervisor/src/index.ts", import.meta.url)),
    "@atelier/domain": fileURLToPath(new URL("../../packages/domain/src/index.ts", import.meta.url)),
    "@atelier/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
  },
  i18n: {
    locales: [
      { code: "en", language: "en-US", name: "English", file: "en.json" },
      { code: "pt-BR", language: "pt-BR", name: "Português", file: "pt-BR.json" },
    ],
    defaultLocale: "en",
    strategy: "no_prefix",
    lazy: true,
    langDir: "locales",
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "atelier-locale",
      fallbackLocale: "en",
      redirectOn: "root",
    },
    experimental: {
      typedOptionsAndMessages: "default",
    },
  },
  routeRules: {
    "/w/**": { ssr: false },
  },
  nitro: {
    experimental: {
      websocket: true,
    },
    externals: {
      inline: ["@atelier/supervisor", "@atelier/domain", "@atelier/contracts"],
    },
  },
  runtimeConfig: {
    sessionCookie: "atelier_session",
    public: {
      previewPath: "/-/p",
    },
  },
  app: {
    head: {
      title: "Atelier",
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
    },
  },
});
