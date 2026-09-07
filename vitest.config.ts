import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'doc-preview': resolve(import.meta.dirname, 'packages/doc-preview/src/index.ts'),
    },
    // Match what a browser bundler picks. pptxtojson's `main` is a UMD build
    // with no named exports; its `module` field is the ESM one the app uses.
    mainFields: ['browser', 'module', 'jsnext:main', 'jsnext', 'main'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // The fixture-parsing suite runs the real Office parsers.
    testTimeout: 20000,
  },
})
