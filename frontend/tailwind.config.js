/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0b0f14",
          800: "#11161d",
          700: "#1a212b",
          600: "#252e3a",
          500: "#33404f",
        },
        accent: {
          DEFAULT: "#5b8cff",
          soft: "#3a5bbf",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
