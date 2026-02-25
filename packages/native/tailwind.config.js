/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,ts,tsx}',
    './components/**/*.{js,ts,tsx}',
    './hooks/**/*.{js,ts,tsx}',
    './state/**/*.{js,ts,tsx}',
  ],

  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['JetBrains Mono'],
        mono: ['JetBrains Mono'],
      },
    },
  },
  plugins: [],
};
