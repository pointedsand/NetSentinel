/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Default worker pools crash on this Node version; the VM pool runs reliably.
    pool: 'vmThreads',
    setupFiles: ['./src/setupTests.ts'],
  },
})
