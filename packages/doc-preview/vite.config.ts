import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

/**
 * Library build. Every runtime dependency is left external so the consuming app
 * resolves and de-duplicates them — bundling PDF.js or ExcelJS in here would
 * defeat the per-renderer code splitting and duplicate them for anyone who
 * already depends on them.
 */
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  'react/jsx-runtime',
]

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'doc-preview.js',
      cssFileName: 'doc-preview',
    },
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      output: { chunkFileNames: '[name]-[hash].js' },
    },
    sourcemap: true,
    target: 'es2022',
  },
})
