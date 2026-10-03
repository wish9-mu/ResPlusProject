import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        emergency: {
          DEFAULT: "#dc2626",
          dark: "#991b1b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
