import type { DocKind, UnsupportedReason } from './types'

const MIME_TO_KIND: Record<string, DocKind> = {
  'application/pdf': 'pdf',
  'application/x-pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'application/json': 'json',
  'text/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
  'text/csv': 'csv',
  'text/tab-separated-values': 'csv',
}

const EXT_TO_KIND: Record<string, DocKind> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  md: 'markdown',
  markdown: 'markdown',
  mdown: 'markdown',
  mkd: 'markdown',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  jfif: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  bmp: 'image',
  ico: 'image',
  svg: 'image',
  tif: 'image',
  tiff: 'image',
  json: 'json',
  jsonc: 'json',
  jsonl: 'json',
  ndjson: 'json',
  xml: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  rss: 'xml',
  atom: 'xml',
  html: 'html',
  htm: 'html',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  // By convention .ogg is audio (Ogg Vorbis) and .ogv is video (Ogg Theora).
  ogv: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  oga: 'audio',
  ogg: 'audio',
  txt: 'text',
  text: 'text',
  log: 'text',
  yaml: 'text',
  yml: 'text',
  csv: 'csv',
  tsv: 'csv',
}

/** Legacy binary Office formats, deliberately unsupported. */
const LEGACY_MIMES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
])
const LEGACY_EXTS = new Set(['doc', 'xls', 'ppt'])

/** MIME types that carry no information about the real format. */
const GENERIC_MIMES = new Set([
  '',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'binary/octet-stream',
])

export interface KindResult {
  kind: DocKind
  mimeType: string
  unsupportedReason?: UnsupportedReason
}

export function extensionOf(nameOrUrl: string): string {
  if (!nameOrUrl) return ''
  let path = nameOrUrl
  try {
    // Strip query and hash so `?v=2` does not become the extension.
    path = new URL(nameOrUrl, 'http://localhost').pathname
  } catch {
    path = nameOrUrl.split(/[?#]/)[0]
  }
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase()
}

export function fileNameOf(url: string, fileName?: string): string {
  if (fileName) return fileName
  try {
    const path = new URL(url, 'http://localhost').pathname
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || 'document'
  } catch {
    return 'document'
  }
}

/** Normalise `text/plain; charset=utf-8` down to `text/plain`. */
function bareMime(mimeType?: string): string {
  return (mimeType ?? '').split(';')[0].trim().toLowerCase()
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false
  return sig.every((b, i) => bytes[i] === b)
}

/** Magic numbers for the raster formats browsers decode. */
function imageSignature(head: Uint8Array): string | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (startsWith(head, [0x42, 0x4d])) return 'image/bmp'
  // RIFF....WEBP — the size field sits between the two markers.
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && head.length >= 12) {
    const tag = String.fromCharCode(...head.subarray(8, 12))
    if (tag === 'WEBP') return 'image/webp'
  }
  /*
   * TIFF, in both byte orders: "II" (Intel, little-endian) or "MM" (Motorola,
   * big-endian) followed by 42 — or 43 for BigTIFF.
   *
   * Only Safari decodes TIFF, so on other browsers this routes to the image
   * renderer purely to fail well: it reports the specific format it cannot show
   * and offers the file, rather than the vague "unsupported" state these files
   * used to land in whenever the server did not name the type.
   */
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'image/tiff'
  }
  if (startsWith(head, [0x49, 0x49, 0x2b, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2b])) {
    return 'image/tiff'
  }
  // ISO base media: ....ftyp<brand>, used by AVIF and HEIC.
  if (head.length >= 12 && String.fromCharCode(...head.subarray(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...head.subarray(8, 12))
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif'
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) {
      return 'image/heic'
    }
  }
  return null
}

/**
 * Magic numbers for the container formats `<video>`/`<audio>` can play.
 *
 * Unlike `imageSignature`, this returns a full `KindResult` rather than a bare
 * MIME string: video and audio share several of the same containers (ISO base
 * media, RIFF), so the kind has to be decided here rather than by the caller.
 */
function mediaSignature(head: Uint8Array): KindResult | null {
  // WebM: EBML header.
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { kind: 'video', mimeType: 'video/webm' }
  }
  // ISO base media: ....ftyp<brand> — the same container family as the
  // AVIF/HEIC check in imageSignature, just the video/audio branch of it.
  if (head.length >= 12 && String.fromCharCode(...head.subarray(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...head.subarray(8, 12))
    if (brand === 'M4A ' || brand === 'M4B ') return { kind: 'audio', mimeType: 'audio/mp4' }
    if (brand === 'qt  ') return { kind: 'video', mimeType: 'video/quicktime' }
    if (brand.startsWith('isom') || brand.startsWith('iso2') || brand.startsWith('mp4') || brand === 'M4V ') {
      return { kind: 'video', mimeType: 'video/mp4' }
    }
  }
  // RIFF....WAVE — the same container WebP uses in imageSignature, tagged for
  // audio instead.
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && head.length >= 12) {
    const tag = String.fromCharCode(...head.subarray(8, 12))
    if (tag === 'WAVE') return { kind: 'audio', mimeType: 'audio/wav' }
  }
  // An ID3v2 tag is the reliable MP3 signature. A raw MPEG frame-sync byte
  // (0xFF followed by three set bits) exists too, but it is common enough in
  // arbitrary binary data that trusting it here would be a guess rather than
  // a hint — an ID3-less MP3 with a generic type and no extension falls
  // through to unknown-format, same as any other format with no signature.
  if (startsWith(head, [0x49, 0x44, 0x33])) return { kind: 'audio', mimeType: 'audio/mpeg' }
  return null
}

const SIG_PDF = [0x25, 0x50, 0x44, 0x46] //  %PDF
const SIG_ZIP = [0x50, 0x4b] //             PK
const SIG_OLE2 = [0xd0, 0xcf, 0x11, 0xe0] // legacy Office compound file

/**
 * Identify a document from its MIME hint, then its extension, then its bytes.
 *
 * The byte check is not a last resort: servers routinely hand back OOXML as
 * `application/octet-stream` or `application/zip`, so a generic MIME plus a
 * missing extension is a normal case rather than an edge case.
 */
/**
 * What the MIME hint and file name alone say, with no bytes read.
 *
 * This is stages 1 and 2 of `resolveKind`, split out because it is synchronous:
 * a thumbnail needs a type the instant it mounts so it can show the right
 * placeholder while the document is still downloading. Returns null when only
 * the bytes can decide.
 */
export function guessKind(input: {
  mimeType?: string
  fileName?: string
  url?: string
}): KindResult | null {
  const mime = bareMime(input.mimeType)
  const ext = extensionOf(input.fileName || input.url || '')

  if (LEGACY_MIMES.has(mime) || LEGACY_EXTS.has(ext)) {
    return { kind: 'unsupported', mimeType: mime || 'application/octet-stream', unsupportedReason: 'legacy-office' }
  }

  // 1. An informative MIME type is trusted.
  if (!GENERIC_MIMES.has(mime)) {
    const byMime = MIME_TO_KIND[mime]
    if (byMime) return { kind: byMime, mimeType: mime }
    // image/* is taken as a family, including image/svg+xml — the renderer shows
    // SVG as a picture, which is what someone opening one expects.
    if (mime.startsWith('image/')) return { kind: 'image', mimeType: mime }
    // video/* and audio/* are likewise taken as families rather than enumerated:
    // the browser decides what it can actually play, same as images.
    if (mime.startsWith('video/')) return { kind: 'video', mimeType: mime }
    if (mime.startsWith('audio/')) return { kind: 'audio', mimeType: mime }
    // RFC 6839 structured suffixes: application/vnd.api+json, application/rss+xml.
    if (mime.endsWith('+json')) return { kind: 'json', mimeType: mime }
    if (mime.endsWith('+xml')) return { kind: 'xml', mimeType: mime }
    if (mime.startsWith('text/')) {
      if (ext === 'md' || ext === 'markdown') return { kind: 'markdown', mimeType: mime }
      if (ext === 'csv' || ext === 'tsv') return { kind: 'csv', mimeType: mime }
      return { kind: 'text', mimeType: mime }
    }
  }

  // 2. Extension. A generic hint carries no information, so the detected kind's
  //    canonical type is reported instead — `meta.mimeType` is the effective
  //    type, not an echo of what the server guessed.
  const byExt = EXT_TO_KIND[ext]
  if (byExt) {
    return { kind: byExt, mimeType: GENERIC_MIMES.has(mime) ? mimeForKind(byExt) : mime }
  }

  return null
}

export async function resolveKind(input: {
  mimeType?: string
  fileName?: string
  url?: string
  data?: ArrayBuffer
}): Promise<KindResult> {
  const guess = guessKind(input)
  if (guess) return guess

  const mime = bareMime(input.mimeType)

  // 3. Bytes.
  if (input.data && input.data.byteLength >= 4) {
    const head = new Uint8Array(input.data, 0, Math.min(16, input.data.byteLength))
    if (startsWith(head, SIG_PDF)) return { kind: 'pdf', mimeType: 'application/pdf' }
    if (startsWith(head, SIG_OLE2)) {
      return { kind: 'unsupported', mimeType: mime || 'application/octet-stream', unsupportedReason: 'legacy-office' }
    }
    const image = imageSignature(head)
    if (image) return { kind: 'image', mimeType: image }
    const media = mediaSignature(head)
    if (media) return media
    if (startsWith(head, SIG_ZIP)) {
      const zipKind = await sniffOoxml(input.data)
      if (zipKind) return { kind: zipKind, mimeType: mimeForKind(zipKind) }
    }
    if (looksLikeText(head)) return sniffTextual(input.data)
  }

  return { kind: 'unsupported', mimeType: mime || 'application/octet-stream', unsupportedReason: 'unknown-format' }
}

/** Distinguish the three OOXML containers by their part names. */
async function sniffOoxml(data: ArrayBuffer): Promise<DocKind | null> {
  const { default: JSZip } = await import('jszip')
  try {
    const zip = await JSZip.loadAsync(data)
    if (zip.file('word/document.xml')) return 'docx'
    if (zip.file('xl/workbook.xml')) return 'xlsx'
    if (zip.file('ppt/presentation.xml')) return 'pptx'
  } catch {
    // Not a readable zip; fall through to the unsupported state.
  }
  return null
}

/**
 * Tell JSON and XML apart from prose when neither the type nor the name says.
 *
 * A document downloaded as `application/octet-stream` from a blob endpoint is a
 * routine case, and dropping it into an unformatted <pre> when it is really an
 * API payload is the outcome this whole detection chain exists to avoid.
 */
function sniffTextual(data: ArrayBuffer): KindResult {
  // Only the opening bytes are needed, and decoding a huge file to guess is waste.
  const prefix = new TextDecoder('utf-8', { fatal: false })
    .decode(new Uint8Array(data, 0, Math.min(4096, data.byteLength)))
    .replace(/^\ufeff/, '')
    .trimStart()

  if (prefix.startsWith('<?xml') || /^<[A-Za-z_!/?]/.test(prefix)) {
    // An SVG is markup, but it is a picture first.
    if (/<svg[\s>]/i.test(prefix)) return { kind: 'image', mimeType: 'image/svg+xml' }
    if (/^<!doctype html/i.test(prefix) || /^<html[\s>]/i.test(prefix)) {
      return { kind: 'html', mimeType: 'text/html' }
    }
    return { kind: 'xml', mimeType: 'application/xml' }
  }

  if (prefix.startsWith('{') || prefix.startsWith('[')) {
    // Confirm by parsing, so a stray brace in prose does not become "JSON".
    try {
      JSON.parse(new TextDecoder().decode(new Uint8Array(data)))
      return { kind: 'json', mimeType: 'application/json' }
    } catch {
      // Not valid JSON; fall through to plain text.
    }
  }

  return { kind: 'text', mimeType: 'text/plain' }
}

/** Reject bytes that contain NULs or stray control characters. */
function looksLikeText(head: Uint8Array): boolean {
  for (const byte of head) {
    if (byte === 0) return false
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false
  }
  return true
}

export function mimeForKind(kind: DocKind): string {
  switch (kind) {
    case 'pdf':
      return 'application/pdf'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'markdown':
      return 'text/markdown'
    case 'json':
      return 'application/json'
    case 'xml':
      return 'application/xml'
    case 'image':
      return 'image/png'
    case 'html':
      return 'text/html'
    case 'video':
      return 'video/mp4'
    case 'audio':
      return 'audio/mpeg'
    case 'csv':
      return 'text/csv'
    case 'text':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}
