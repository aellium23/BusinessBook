/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vgt: { DEFAULT: '#1D9E75', light: '#E1F5EE', dark: '#0F6E56' },
        ect: { DEFAULT: '#D85A30', light: '#FAECE7', dark: '#993C1D' },
        navy: { DEFAULT: '#0D2137', light: '#1a3a5c' },
      },
    },
  },
  plugins: [],
}
