/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",             // 1. Matches index.html in the root
    "./pages/**/*.html",    // 2. Matches all HTML files in the pages folder
    "./js/**/*.js",         // 3. Matches all JS files (where you might use classList.add)
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};