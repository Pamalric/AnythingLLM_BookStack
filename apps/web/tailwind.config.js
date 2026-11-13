/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#e2e8f0",
        accent: "#0f766e",
      },
      fontFamily: {
        sans: ['"Source Sans 3"', "Segoe UI", "sans-serif"],
        display: ['"Fraunces"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
