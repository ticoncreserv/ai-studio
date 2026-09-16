import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{vue,ts}", "./i18n/**/*.json"],
  theme: {
    extend: {
      colors: {
        canvas: "#07080C",
        paper: "#12141C",
        line: "rgba(255,255,255,0.08)",
        ink: {
          950: "#F3F6FC",
          800: "#D5DBE8",
          600: "#9AA3B8",
          500: "#7B849A",
          300: "#5C6578",
          100: "#1A1D28",
        },
        coral: {
          50: "rgba(110, 168, 255, 0.12)",
          100: "rgba(110, 168, 255, 0.22)",
          400: "#9CC4FF",
          500: "#6EA8FF",
          600: "#4C8DF2",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        lift: "0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 24px rgba(0,0,0,0.28)",
        float: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05)",
        glow: "0 0 0 1px rgba(110,168,255,0.35), 0 10px 36px rgba(80,140,255,0.28)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
    },
  },
} satisfies Config;
