import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 1) continue;
    const key = trimmed.slice(0, i);
    const value = trimmed.slice(i + 1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  telemetry: false,
  modules: ["@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
    },
  },
  alias: {
    "@atelier/supervisor": fileURLToPath(new URL("../../services/supervisor/src/index.ts", import.meta.url)),
    "@atelier/domain": fileURLToPath(new URL("../../packages/domain/src/index.ts", import.meta.url)),
    "@atelier/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
  },
  i18n: {
    locales: [
      { code: "pt-BR", language: "pt-BR", name: "Português", file: "pt-BR.json" },
      { code: "en", language: "en-US", name: "English", file: "en.json" },
    ],
    defaultLocale: "pt-BR",
    strategy: "no_prefix",
    lazy: true,
    langDir: "locales",
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "atelier-locale",
      fallbackLocale: "pt-BR",
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
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#07080C" },
        { name: "color-scheme", content: "dark" },
      ],
    },
  },
});
