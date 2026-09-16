import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{vue,ts}", "./i18n/**/*.json"],
  theme: {
    extend: {
      colors: {
        canvas: "#EFE8DE",
        paper: "#FFFBF5",
        line: "#E4DACD",
        ink: {
          950: "#1A1612",
          800: "#2C261F",
          600: "#5A5249",
          500: "#746C62",
          300: "#B3A89C",
          100: "#F1E9DF",
        },
        coral: {
          50: "#FFF1EC",
          100: "#FFD9CE",
          400: "#FF7A58",
          500: "#FF5A36",
          600: "#E64522",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        lift: "0 1px 2px rgba(28, 18, 12, 0.04), 0 10px 28px rgba(28, 18, 12, 0.07)",
        float: "0 18px 50px rgba(28, 18, 12, 0.12)",
        glow: "0 8px 24px rgba(255, 90, 54, 0.28)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.7)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
    },
  },
} satisfies Config;
