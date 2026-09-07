import type { PdfAssetOptions } from '../types'

export const WORKER_HELP =
  'PDF rendering needs a local PDF.js worker. Pass one from your app, where your ' +
  'bundler can resolve it:\n\n' +
  "  import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'   // Vite\n" +
  '  <DocumentPreview pdf={{ workerSrc }} … />\n\n' +
  'See the README for cMapUrl and standardFontDataUrl, which are needed for ' +
  'CJK text and non-embedded fonts.'

/**
 * The worker cannot be resolved from inside this package.
 *
 * `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` looks like
 * the obvious default, but Vite's library mode inlines the referenced file as a
 * ~1.7 MB base64 data: URI — which bloats this chunk and is blocked outright by
 * any app with a sane worker-src CSP. Only the consuming app's bundler knows
 * where the worker should actually live, so it has to supply the URL.
 *
 * cMapUrl and standardFontDataUrl are left unset when not provided: the PDF.js
 * *API* defaults them to null and simply skips those resources, so omitting them
 * degrades CJK and non-embedded font rendering but never reaches the network.
 */
export function resolveAssets(overrides?: PdfAssetOptions) {
  if (!overrides?.workerSrc) throw new Error(WORKER_HELP)
  return {
    workerSrc: overrides.workerSrc,
    cMapUrl: overrides.cMapUrl,
    standardFontDataUrl: overrides.standardFontDataUrl,
  }
}

/** Options for `getDocument` that keep every asset local. */
export function documentParams(data: ArrayBuffer, assets: ReturnType<typeof resolveAssets>) {
  return {
    // getDocument transfers the buffer to the worker, which detaches it and
    // would break a second render (React strict mode, or a re-mount). Copy.
    data: data.slice(0),
    ...(assets.cMapUrl ? { cMapUrl: assets.cMapUrl, cMapPacked: true } : {}),
    ...(assets.standardFontDataUrl ? { standardFontDataUrl: assets.standardFontDataUrl } : {}),
  }
}
