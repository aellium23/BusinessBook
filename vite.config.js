import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Vitest runs unit tests under src/. Playwright e2e specs live in e2e/.
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-recharts': ['recharts'],
          'vendor-icons': ['lucide-react'],
        }
      }
    }
  }
})
