/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // Simple brand colors – no PIT naming
        primary: "#c41111",
        primaryDark: "#8f0505"
      }
    }
  },
  plugins: []
};
