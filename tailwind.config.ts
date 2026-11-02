import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "'SF Mono'",
          "Menlo",
          "Consolas",
          "'Liberation Mono'",
          "monospace",
        ],
      },
      colors: {
        obsidian: {
          950: "#070709",
          900: "#0d0e12",
          850: "#12141a",
          800: "#181a24",
          700: "#222533",
          600: "#2e3245",
        },
        nvidia: {
          DEFAULT: "#76b900",
          dark: "#5a8d00",
          soft: "rgba(118, 185, 0, 0.12)",
        },
        brand: {
          deep: "#07070a",
          canvas: "#0c0d14",
          subtle: "#12141e",
          elevated: "#181a26",
          border: "#23242c",
          "border-strong": "#353745",
        },
        crimson: {
          50: "#fff1f3",
          100: "#ffe4e7",
          200: "#fecdd4",
          300: "#fda4b2",
          400: "#fb7188",
          500: "#f43f60",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
          950: "#4c0519",
        },
      },
    },
  },
  plugins: [],
};

export default config;
