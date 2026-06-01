import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        cotamed: {
          50: "#F5F9FF",
          100: "#E8F2FF",
          500: "#0A84FF",
          600: "#0057D9",
          700: "#0046B0",
          900: "#072B63"
        }
      }
    }
  },
  plugins: []
};

export default config;
