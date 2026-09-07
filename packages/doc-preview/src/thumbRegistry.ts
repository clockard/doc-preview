import { lazy } from 'react'
import type { DocKind, ThumbnailComponent } from './types'

/**
 * Code-split exactly like RENDERERS: a grid of image tiles must never pull in
 * the PDF engine, and the heavy parsers are shared chunks when both a thumbnail
 * and the full renderer for a format end up on the same page.
 */
export const THUMBNAILS: Partial<Record<DocKind, ThumbnailComponent>> = {
  pdf: lazy(() => import('./thumbnails/PdfThumbnail').then((m) => ({ default: m.PdfThumbnail }))),
  docx: lazy(() => import('./thumbnails/DocxThumbnail').then((m) => ({ default: m.DocxThumbnail }))),
  xlsx: lazy(() => import('./thumbnails/XlsxThumbnail').then((m) => ({ default: m.XlsxThumbnail }))),
  pptx: lazy(() => import('./thumbnails/PptxThumbnail').then((m) => ({ default: m.PptxThumbnail }))),
  markdown: lazy(() => import('./thumbnails/TextThumbnail').then((m) => ({ default: m.TextThumbnail }))),
  json: lazy(() => import('./thumbnails/TextThumbnail').then((m) => ({ default: m.TextThumbnail }))),
  xml: lazy(() => import('./thumbnails/TextThumbnail').then((m) => ({ default: m.TextThumbnail }))),
  // No dedicated tile: a monospace preview of the raw rows is enough at tile
  // size, the same as it is for plain text.
  csv: lazy(() => import('./thumbnails/TextThumbnail').then((m) => ({ default: m.TextThumbnail }))),
  image: lazy(() => import('./thumbnails/ImageThumbnail').then((m) => ({ default: m.ImageThumbnail }))),
  html: lazy(() => import('./thumbnails/HtmlThumbnail').then((m) => ({ default: m.HtmlThumbnail }))),
  video: lazy(() => import('./thumbnails/VideoThumbnail').then((m) => ({ default: m.VideoThumbnail }))),
  audio: lazy(() => import('./thumbnails/AudioThumbnail').then((m) => ({ default: m.AudioThumbnail }))),
  text: lazy(() => import('./thumbnails/TextThumbnail').then((m) => ({ default: m.TextThumbnail }))),
}
