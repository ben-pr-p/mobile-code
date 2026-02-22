/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,ts,tsx}',
    './components/**/*.{js,ts,tsx}',
    './hooks/**/*.{js,ts,tsx}',
    './state/**/*.{js,ts,tsx}',
  ],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'oc-bg-primary': '#0A0F1C',
        'oc-bg-surface': '#1E293B',
        'oc-bg-inset': '#0F172A',
        'oc-accent': '#22D3EE',
        'oc-text-primary': '#FFFFFF',
        'oc-text-secondary': '#94A3B8',
        'oc-text-tertiary': '#64748B',
        'oc-text-muted': '#475569',
        'oc-divider': '#0F172A',
        'oc-green': '#4ADE80',
        'oc-red': '#EF4444',
        'oc-amber': '#F59E0B',
        'oc-spotify': '#1DB954',
      },
      fontFamily: {
        sans: ['Inter'],
        mono: ['JetBrains Mono'],
      },
    },
  },
  plugins: [],
};
