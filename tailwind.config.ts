import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: "#0f0f12",
          card: "#1a1a21",
          border: "#2a2a35",
          accent: "#3b82f6",
          text: "#e4e4e7",
          muted: "#a1a1aa",
        },
      },
    },
  },
  plugins: [],
};
export default config;
