import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/ui/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
