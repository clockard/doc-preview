// Resolved through Vite so the worker, cMaps and standard fonts are served from
// this app's own origin. Nothing here may point at a CDN — that is the whole
// offline requirement, and PDF.js falls back to a remote host if these are unset.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PdfAssetOptions } from 'doc-preview'

export const PDF_ASSETS: PdfAssetOptions = {
  workerSrc,
  // Copied into public/ by `npm run fixtures`.
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
}
