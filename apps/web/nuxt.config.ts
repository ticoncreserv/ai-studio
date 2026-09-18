import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { installDisconnectGuard } from "./server/utils/disconnect-guard";
import { atelierLaravelPublicAssets } from "./server/utils/preview-public-assets";

installDisconnectGuard();

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
    // Preview GET/HEAD must run before Vite's `?import` rewrite; login POSTs go to Nitro.
    // Orphan Laravel /assets and /resources resolve via skip_vite paths, /w/:id Referer, or cookie.
    plugins: [tailwindcss(), atelierLaravelPublicAssets()],
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
    detectBrowserLanguage: false,
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
      title: "Concreserv IA Studio",
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
      ],
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#07080C" },
        { name: "color-scheme", content: "dark" },
      ],
    },
  },
});
