import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{vue,ts}", "./i18n/**/*.json"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0c0d10",
          900: "#12141a",
          800: "#1a1d25",
          700: "#262a35",
          500: "#8b93a7",
          200: "#d7dbe6",
        },
        copper: {
          400: "#e8a54b",
          500: "#d97757",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
} satisfies Config;
