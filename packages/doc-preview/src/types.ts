import type { ComponentType } from 'react'

/** Document families this component knows how to render. */
export type DocKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'markdown'
  | 'json'
  | 'xml'
  | 'csv'
  | 'image'
  | 'html'
  | 'video'
  | 'audio'
  | 'text'
  | 'unsupported'

/** Why a document could not be rendered, when `kind` is `unsupported`. */
export type UnsupportedReason =
  | 'legacy-office'
  | 'unknown-format'
  | 'encrypted'

export interface DocumentMeta {
  kind: DocKind
  /** Effective MIME type after detection, which may differ from the supplied hint. */
  mimeType: string
  fileName: string
  byteLength: number
  url: string
  /** Only set when `kind` is `unsupported`. */
  unsupportedReason?: UnsupportedReason
}

/** Locations of PDF.js runtime assets. All must resolve locally to stay offline. */
export interface PdfAssetOptions {
  workerSrc?: string
  cMapUrl?: string
  standardFontDataUrl?: string
}

/** Props every renderer receives. Renderers never fetch; they are handed bytes. */
export interface RendererProps {
  data: ArrayBuffer
  meta: DocumentMeta
  pdf?: PdfAssetOptions
  onError?: (err: Error) => void
}

export type RendererComponent = ComponentType<RendererProps>

/** How a document is framed inside a thumbnail's box. */
export type ThumbFit = 'cover' | 'contain'

/**
 * What a thumbnail draws.
 *
 * `render` previews the document itself. `icon` shows only the typed file icon
 * and **makes no network request at all** — the kind comes from the MIME hint
 * and file name alone, which is what makes an icon-only listing cheap.
 */
export type ThumbMode = 'render' | 'icon'

/** Props every thumbnail renderer receives. Like renderers, they are handed bytes. */
export interface ThumbnailProps {
  data: ArrayBuffer
  meta: DocumentMeta
  /** The measured tile, in CSS pixels. */
  box: { width: number; height: number }
  fit: ThumbFit
  pdf?: PdfAssetOptions
  onError?: (err: Error) => void
}

export type ThumbnailComponent = ComponentType<ThumbnailProps>

export interface DocumentPreviewProps {
  /** URL the document is fetched from. */
  url: string
  /** MIME hint. Detection falls back to extension and magic bytes when wrong or generic. */
  mimeType?: string
  /** Improves extension detection and names the download. Inferred from `url` when omitted. */
  fileName?: string
  /** Passed through to `fetch` — credentials, auth headers, cache mode. */
  fetchOptions?: RequestInit
  /** Refuse documents larger than this. Defaults to 100 MB. */
  maxBytes?: number
  className?: string
  onLoad?: (meta: DocumentMeta) => void
  onError?: (err: Error) => void
  /** Override or extend the built-in renderers. */
  renderers?: Partial<Record<DocKind, RendererComponent>>
  /** Where PDF.js should find its worker, cMaps and standard fonts. */
  pdf?: PdfAssetOptions
}

/** Error carrying enough context for the error state to say something useful. */
export class DocumentPreviewError extends Error {
  readonly code: 'fetch' | 'http' | 'too-large' | 'parse' | 'aborted'
  readonly status?: number

  constructor(
    code: DocumentPreviewError['code'],
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = 'DocumentPreviewError'
    this.code = code
    this.status = options?.status
  }
}

export interface DocumentThumbnailProps {
  /** URL the document is fetched from. */
  url: string
  /** MIME hint. Detection falls back to extension and magic bytes when wrong or generic. */
  mimeType?: string
  /** Improves extension detection and labels the tile. Inferred from `url` when omitted. */
  fileName?: string
  /** Passed through to `fetch` — credentials, auth headers, cache mode. */
  fetchOptions?: RequestInit
  /** Lower than the preview's 100 MB: a tile is not worth a huge download. Defaults to 25 MB. */
  maxBytes?: number
  /** Convenience for the box size; equivalent to sizing `.dp-thumb` in CSS. */
  width?: number
  height?: number
  /** Crop to fill the tile, or letterbox the whole page. Defaults to `cover`. */
  fit?: ThumbFit
  /**
   * `render` (default) previews the document. `icon` shows only the typed file
   * icon and fetches nothing, so `onLoad` never fires and detection falls back
   * to the MIME hint and file name.
   */
  mode?: ThumbMode
  /** Defer fetching until the tile nears the viewport. Defaults to true. */
  lazy?: boolean
  /** How far ahead of the viewport `lazy` starts loading. Defaults to '300px'. */
  rootMargin?: string
  className?: string
  onLoad?: (meta: DocumentMeta) => void
  onError?: (err: Error) => void
  /** Override or extend the built-in thumbnail renderers. */
  thumbnails?: Partial<Record<DocKind, ThumbnailComponent>>
  /** Where PDF.js should find its worker, cMaps and standard fonts. */
  pdf?: PdfAssetOptions
}
