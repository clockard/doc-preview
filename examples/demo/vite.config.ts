import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point at source so the demo exercises the real code with HMR rather
      // than a stale dist build.
      'doc-preview': resolve(import.meta.dirname, '../../packages/doc-preview/src/index.ts'),
    },
  },
  // ExcelJS still ships a CommonJS build that expects these Node globals.
  define: { global: 'globalThis' },
  optimizeDeps: { include: ['exceljs'] },
})
