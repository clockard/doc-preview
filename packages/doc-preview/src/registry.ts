import { lazy } from 'react'
import type { DocKind, RendererComponent } from './types'

/**
 * Renderers are code-split on purpose. Together these parsers weigh several
 * megabytes; loading them eagerly would make a plain-text preview pay for the
 * PDF engine. Each entry resolves only once its format is actually opened.
 */
export const RENDERERS: Partial<Record<DocKind, RendererComponent>> = {
  pdf: lazy(() => import('./renderers/PdfRenderer').then((m) => ({ default: m.PdfRenderer }))),
  docx: lazy(() => import('./renderers/DocxRenderer').then((m) => ({ default: m.DocxRenderer }))),
  xlsx: lazy(() => import('./renderers/XlsxRenderer').then((m) => ({ default: m.XlsxRenderer }))),
  pptx: lazy(() => import('./renderers/PptxRenderer').then((m) => ({ default: m.PptxRenderer }))),
  markdown: lazy(() => import('./renderers/MarkdownRenderer').then((m) => ({ default: m.MarkdownRenderer }))),
  json: lazy(() => import('./renderers/StructuredRenderer').then((m) => ({ default: m.StructuredRenderer }))),
  xml: lazy(() => import('./renderers/StructuredRenderer').then((m) => ({ default: m.StructuredRenderer }))),
  csv: lazy(() => import('./renderers/CsvRenderer').then((m) => ({ default: m.CsvRenderer }))),
  image: lazy(() => import('./renderers/ImageRenderer').then((m) => ({ default: m.ImageRenderer }))),
  html: lazy(() => import('./renderers/HtmlRenderer').then((m) => ({ default: m.HtmlRenderer }))),
  video: lazy(() => import('./renderers/VideoRenderer').then((m) => ({ default: m.VideoRenderer }))),
  audio: lazy(() => import('./renderers/AudioRenderer').then((m) => ({ default: m.AudioRenderer }))),
  text: lazy(() => import('./renderers/TextRenderer').then((m) => ({ default: m.TextRenderer }))),
}
