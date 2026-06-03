/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vgt:  { DEFAULT: '#1D9E75', light: '#E1F5EE', dark: '#0F6E56' },
        ect:  { DEFAULT: '#D85A30', light: '#FAECE7', dark: '#993C1D' },
        navy: { DEFAULT: '#0D2137', light: '#1a3a5c' },
      },
      // Refined shadow scale — subtle, intentional elevation.
      //   sm  → resting cards / rows
      //   md  → hover / interactive lift
      //   lg  → floating elements (popovers, dropdowns)
      //   modal → bottom sheets & dialogs
      boxShadow: {
        sm:    '0 1px 2px rgba(13, 33, 55, 0.06)',
        md:    '0 4px 10px rgba(13, 33, 55, 0.08)',
        lg:    '0 10px 24px rgba(13, 33, 55, 0.10)',
        modal: '0 -8px 40px rgba(13, 33, 55, 0.18)',
      },
      // ── Design tokens ───────────────────────────────────────────────────
      // Unified across the app so components don't invent their own scales.
      //   radius-card     → cards, list rows, dropdowns    (16px)
      //   radius-modal    → modals, bottom sheets          (24px)
      //   radius-control  → inputs, buttons, chips          (12px)
      //   radius-pill     → badges, roundy tags             (full)
      borderRadius: {
        card:    '1rem',
        modal:   '1.5rem',
        control: '0.75rem',
      },
      // Typography scale the app actually uses. Sizes below xs are intentional
      // for dense badges but go through a named token so we don't sprinkle
      // `text-[10px]` / `text-[11px]` / `text-[9px]` everywhere.
      fontSize: {
        micro: ['0.625rem', { lineHeight: '0.875rem' }], // 10px — badges
        tiny:  ['0.6875rem', { lineHeight: '1rem' }],    // 11px — helpers
      },
      // Minimum touch target size per Apple HIG (44px). Use for icon buttons
      // where the visual is smaller than the hit area.
      minHeight: { tap: '44px' },
      minWidth:  { tap: '44px' },
    },
  },
  plugins: [],
}
