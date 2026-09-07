import { describe, expect, it } from 'vitest'
import { extensionOf, fileNameOf, guessKind, resolveKind } from 'doc-preview'
import { bytes, fixture } from './helpers'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

describe('extensionOf', () => {
  it('ignores query strings and fragments', () => {
    expect(extensionOf('/files/report.docx?v=2&t=abc')).toBe('docx')
    expect(extensionOf('https://host/a/b/deck.pptx#slide3')).toBe('pptx')
  })

  it('is case insensitive and tolerates dots in the path', () => {
    expect(extensionOf('/a.b.c/My Report.PDF')).toBe('pdf')
  })

  it('returns empty for extensionless names', () => {
    expect(extensionOf('/download/12345')).toBe('')
    expect(extensionOf('')).toBe('')
  })
})

describe('fileNameOf', () => {
  it('prefers an explicit name', () => {
    expect(fileNameOf('/x/y.pdf', 'Report.pdf')).toBe('Report.pdf')
  })

  it('decodes the name from the URL path', () => {
    expect(fileNameOf('/files/Q3%20Summary.xlsx')).toBe('Q3 Summary.xlsx')
  })
})

describe('resolveKind — MIME type', () => {
  it.each([
    ['application/pdf', 'pdf'],
    [DOCX_MIME, 'docx'],
    [XLSX_MIME, 'xlsx'],
    [PPTX_MIME, 'pptx'],
    ['text/markdown', 'markdown'],
    ['text/plain', 'text'],
  ])('maps %s to %s', async (mimeType, expected) => {
    expect((await resolveKind({ mimeType })).kind).toBe(expected)
  })

  it('strips charset parameters', async () => {
    expect((await resolveKind({ mimeType: 'text/plain; charset=utf-8' })).kind).toBe('text')
  })

  it('treats an unknown text/* subtype as plain text', async () => {
    expect((await resolveKind({ mimeType: 'text/x-log' })).kind).toBe('text')
  })
})

describe('resolveKind — json and xml', () => {
  it.each([
    ['application/json', 'json'],
    ['text/json', 'json'],
    ['application/xml', 'xml'],
    ['text/xml', 'xml'],
  ])('maps %s to %s', async (mimeType, expected) => {
    expect((await resolveKind({ mimeType })).kind).toBe(expected)
  })

  it.each([
    ['application/vnd.api+json', 'json'],
    ['application/ld+json', 'json'],
    ['application/rss+xml', 'xml'],
    ['application/atom+xml', 'xml'],
  ])('honours the RFC 6839 structured suffix in %s', async (mimeType, expected) => {
    expect((await resolveKind({ mimeType })).kind).toBe(expected)
  })

  it.each([
    ['/data/config.json', 'json'],
    ['/logs/events.ndjson', 'json'],
    ['/feed.rss', 'xml'],
    ['/schema.xsd', 'xml'],
  ])('maps the extension in %s to %s', async (url, expected) => {
    expect((await resolveKind({ url })).kind).toBe(expected)
  })

  it('sniffs JSON from content when type and name say nothing', async () => {
    const data = new TextEncoder().encode('  {"a": [1, 2, 3]}  ').buffer as ArrayBuffer
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/xyz', data })
    expect(result.kind).toBe('json')
    expect(result.mimeType).toBe('application/json')
  })

  it('sniffs XML from content when type and name say nothing', async () => {
    const data = new TextEncoder().encode('<?xml version="1.0"?><a><b/></a>').buffer as ArrayBuffer
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/xyz', data })
    expect(result.kind).toBe('xml')
  })

  it('does not mistake prose that starts with a brace for JSON', async () => {
    const data = new TextEncoder().encode('{ this is not json, just a note').buffer as ArrayBuffer
    expect((await resolveKind({ url: '/blob/x', data })).kind).toBe('text')
  })

  it('leaves markdown and plain text alone', async () => {
    expect((await resolveKind({ url: '/a/notes.md' })).kind).toBe('markdown')
    expect((await resolveKind({ url: '/a/notes.txt' })).kind).toBe('text')
  })
})

describe('resolveKind — images', () => {
  it.each([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/bmp',
    'image/svg+xml',
    // Unknown to us, but the browser may still decode it; the renderer reports
    // failure rather than detection refusing up front.
    'image/jxl',
  ])('treats %s as an image', async (mimeType) => {
    expect((await resolveKind({ mimeType })).kind).toBe('image')
  })

  it.each(['/a/photo.jpg', '/a/photo.JPEG', '/a/logo.svg', '/a/anim.gif', '/a/shot.webp', '/a/fav.ico'])(
    'maps %s by extension',
    async (url) => {
      expect((await resolveKind({ url })).kind).toBe('image')
    },
  )

  it.each([
    ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
    ['jpeg', [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0], 'image/jpeg'],
    ['gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0], 'image/gif'],
    ['bmp', [0x42, 0x4d, 0x36, 0x00, 0, 0, 0, 0], 'image/bmp'],
  ])('detects %s from its signature alone', async (_name, signature, expectedMime) => {
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data: bytes(...signature, 0, 0, 0, 0) })
    expect(result.kind).toBe('image')
    expect(result.mimeType).toBe(expectedMime)
  })

  it('detects webp through its RIFF container', async () => {
    const data = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)
    expect((await resolveKind({ url: '/blob/x', data })).mimeType).toBe('image/webp')
  })

  it('detects avif through its ftyp brand', async () => {
    const data = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66)
    expect((await resolveKind({ url: '/blob/x', data })).mimeType).toBe('image/avif')
  })

  it.each(['/scan.tif', '/scan.tiff', '/SCAN.TIFF'])('maps %s by extension', async (url) => {
    expect((await resolveKind({ url })).kind).toBe('image')
  })

  /**
   * Only Safari decodes TIFF. Routing it to the image renderer everywhere is
   * still right: the renderer names the format it cannot show and offers the
   * file, where these used to fall into the vague "unsupported" state whenever
   * the server did not label them.
   */
  it.each([
    ['little-endian', [0x49, 0x49, 0x2a, 0x00]],
    ['big-endian', [0x4d, 0x4d, 0x00, 0x2a]],
    ['BigTIFF little-endian', [0x49, 0x49, 0x2b, 0x00]],
    ['BigTIFF big-endian', [0x4d, 0x4d, 0x00, 0x2b]],
  ])('detects %s TIFF from its signature', async (_label, signature) => {
    const result = await resolveKind({
      mimeType: 'application/octet-stream',
      url: '/blob/x',
      data: bytes(...signature, 0, 0, 0, 0, 0, 0, 0, 0),
    })
    expect(result.kind).toBe('image')
    expect(result.mimeType).toBe('image/tiff')
  })

  it('detects the generated TIFF fixture from bytes alone', async () => {
    const data = await fixture('sample.tiff')
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('image')
    expect(result.mimeType).toBe('image/tiff')
  })

  /** "MM" is printable, so the text heuristic must not claim a big-endian TIFF. */
  it('does not mistake a big-endian TIFF for text', async () => {
    const data = bytes(0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08)
    expect((await resolveKind({ url: '/blob/x', data })).kind).toBe('image')
  })

  /** "BM" is printable, so the text heuristic would otherwise claim it. */
  it('does not mistake a BMP for text', async () => {
    const data = bytes(0x42, 0x4d, 0x46, 0x20, 0x20, 0x20, 0x20, 0x20)
    expect((await resolveKind({ url: '/blob/x', data })).kind).toBe('image')
  })

  /** SVG is markup, but someone opening one wants the picture, not the source. */
  it('sniffs SVG as an image rather than as XML', async () => {
    const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    const data = new TextEncoder().encode(svg).buffer as ArrayBuffer
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('image')
    expect(result.mimeType).toBe('image/svg+xml')
  })

  it('still treats non-SVG markup as XML', async () => {
    const data = new TextEncoder().encode('<?xml version="1.0"?><catalogue/>').buffer as ArrayBuffer
    expect((await resolveKind({ url: '/blob/x', data })).kind).toBe('xml')
  })
})

describe('resolveKind — html, video, audio', () => {
  it('maps text/html to html', async () => {
    expect((await resolveKind({ mimeType: 'text/html' })).kind).toBe('html')
  })

  it.each(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'])('treats %s as video', async (mimeType) => {
    expect((await resolveKind({ mimeType })).kind).toBe('video')
  })

  it.each(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'])('treats %s as audio', async (mimeType) => {
    expect((await resolveKind({ mimeType })).kind).toBe('audio')
  })

  it.each(['/a/page.html', '/a/page.htm'])('maps %s by extension', async (url) => {
    expect((await resolveKind({ url })).kind).toBe('html')
  })

  it.each(['/a/clip.mp4', '/a/clip.webm', '/a/clip.mov', '/a/clip.ogv'])('maps %s by extension', async (url) => {
    expect((await resolveKind({ url })).kind).toBe('video')
  })

  it.each(['/a/track.mp3', '/a/track.wav', '/a/track.m4a', '/a/track.oga', '/a/track.ogg'])(
    'maps %s by extension',
    async (url) => {
      expect((await resolveKind({ url })).kind).toBe('audio')
    },
  )

  it('detects webm from its EBML signature alone', async () => {
    const data = bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0)
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('video')
    expect(result.mimeType).toBe('video/webm')
  })

  it('detects the generated webm fixture from bytes alone', async () => {
    const data = await fixture('sample.webm')
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('video')
  })

  it.each([
    ['isom (MP4)', [0x69, 0x73, 0x6f, 0x6d], 'video', 'video/mp4'],
    ['mp42 (MP4)', [0x6d, 0x70, 0x34, 0x32], 'video', 'video/mp4'],
    ['qt   (MOV)', [0x71, 0x74, 0x20, 0x20], 'video', 'video/quicktime'],
    ['M4A  (audio)', [0x4d, 0x34, 0x41, 0x20], 'audio', 'audio/mp4'],
  ])('detects %s through its ftyp brand', async (_label, brand, kind, mimeType) => {
    const data = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, ...brand)
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe(kind)
    expect(result.mimeType).toBe(mimeType)
  })

  it('detects wav through its RIFF container', async () => {
    const data = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('audio')
    expect(result.mimeType).toBe('audio/wav')
  })

  it('detects the generated wav fixture from bytes alone', async () => {
    const data = await fixture('sample.wav')
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('audio')
    expect(result.mimeType).toBe('audio/wav')
  })

  it('detects mp3 through its ID3 tag', async () => {
    const data = bytes(0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0)
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('audio')
    expect(result.mimeType).toBe('audio/mpeg')
  })

  it('sniffs html as its own kind rather than xml', async () => {
    const data = new TextEncoder().encode('<!doctype html><html><body>hi</body></html>').buffer as ArrayBuffer
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('html')
  })

  it('sniffs a bare <html> tag without a doctype', async () => {
    const data = new TextEncoder().encode('<html><body>hi</body></html>').buffer as ArrayBuffer
    expect((await resolveKind({ url: '/blob/x', data })).kind).toBe('html')
  })

  it('does not mistake an <html> in the middle of markup for the html sniff', async () => {
    // Regression guard: the check anchors to the start of the document, so an
    // <html> element nested inside some other root element stays XML.
    const data = new TextEncoder().encode('<root><html/></root>').buffer as ArrayBuffer
    expect((await resolveKind({ url: '/blob/x', data })).kind).toBe('xml')
  })
})

describe('resolveKind — csv', () => {
  it('maps text/csv to csv', async () => {
    const result = await resolveKind({ mimeType: 'text/csv' })
    expect(result.kind).toBe('csv')
  })

  it.each(['/a/report.csv', '/a/report.tsv', '/a/REPORT.CSV'])('maps %s by extension', async (url) => {
    expect((await resolveKind({ url })).kind).toBe('csv')
  })

  it('prefers a csv extension over a generic text/plain MIME type', async () => {
    expect((await resolveKind({ mimeType: 'text/plain', url: '/export.csv' })).kind).toBe('csv')
  })

  it('leaves an unlabelled comma-separated file as plain text', async () => {
    // CSV has no reliable magic signature, so a generic type and no
    // extension is a guess, not a hint — the same conservative call the
    // detection chain makes everywhere else.
    const data = new TextEncoder().encode('a,b,c\n1,2,3').buffer as ArrayBuffer
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/x', data })
    expect(result.kind).toBe('text')
  })
})

describe('resolveKind — extension fallback', () => {
  it('uses the extension when the MIME type is generic', async () => {
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/a/report.xlsx' })
    expect(result.kind).toBe('xlsx')
    expect(result.mimeType).toBe(XLSX_MIME)
  })

  it('prefers a markdown extension over a plain-text MIME type', async () => {
    expect((await resolveKind({ mimeType: 'text/plain', url: '/notes.md' })).kind).toBe('markdown')
  })

  it.each([
    ['/a/page.html', 'html', 'text/html'],
    ['/a/clip.mp4', 'video', 'video/mp4'],
    ['/a/track.mp3', 'audio', 'audio/mpeg'],
  ])('reports the canonical type for %s when the MIME type is generic', async (url, kind, mimeType) => {
    const result = await resolveKind({ mimeType: 'application/octet-stream', url })
    expect(result.kind).toBe(kind)
    expect(result.mimeType).toBe(mimeType)
  })
})

describe('resolveKind — magic bytes', () => {
  it('detects a PDF with no MIME type or extension', async () => {
    const data = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34)
    const result = await resolveKind({ url: '/download/9f2c', data })
    expect(result.kind).toBe('pdf')
  })

  it.each([
    ['sample.docx', 'docx'],
    ['sample.xlsx', 'xlsx'],
    ['sample.pptx', 'pptx'],
  ])('identifies %s from its zip contents alone', async (name, expected) => {
    const data = await fixture(name)
    // No extension, and the server type says nothing — bytes must decide.
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/abc123', data })
    expect(result.kind).toBe(expected)
  })

  it('identifies a mislabelled .docx served as octet-stream', async () => {
    const data = await fixture('mislabelled.bin')
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/f/mislabelled.bin', data })
    expect(result.kind).toBe('docx')
    expect(result.mimeType).toBe(DOCX_MIME)
  })

  it('falls back to text for printable bytes', async () => {
    const data = new TextEncoder().encode('hello, world').buffer
    expect((await resolveKind({ url: '/blob/x', data })).kind).toBe('text')
  })
})

describe('resolveKind — unsupported', () => {
  it.each(['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'])(
    'rejects the legacy MIME type %s',
    async (mimeType) => {
      const result = await resolveKind({ mimeType })
      expect(result.kind).toBe('unsupported')
      expect(result.unsupportedReason).toBe('legacy-office')
    },
  )

  it.each(['doc', 'xls', 'ppt'])('rejects the legacy extension .%s', async (ext) => {
    const result = await resolveKind({ url: `/files/old.${ext}` })
    expect(result.unsupportedReason).toBe('legacy-office')
  })

  it('recognises an OLE2 compound file by its signature', async () => {
    const data = await fixture('legacy.doc')
    const result = await resolveKind({ mimeType: 'application/octet-stream', url: '/blob/xyz', data })
    expect(result.kind).toBe('unsupported')
    expect(result.unsupportedReason).toBe('legacy-office')
  })

  it('reports unknown formats when nothing matches', async () => {
    const data = bytes(0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x99)
    const result = await resolveKind({ url: '/blob/x', data })
    expect(result.kind).toBe('unsupported')
    expect(result.unsupportedReason).toBe('unknown-format')
  })

  it('does not mistake a plain zip for an Office document', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file('readme.txt', 'not office')
    const data = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await resolveKind({ mimeType: 'application/zip', url: '/a.zip', data })
    expect(result.kind).toBe('unsupported')
  })
})

describe('guessKind', () => {
  it('identifies from an informative MIME type alone', () => {
    expect(guessKind({ mimeType: 'application/pdf' })?.kind).toBe('pdf')
    expect(guessKind({ mimeType: 'image/webp' })?.kind).toBe('image')
    expect(guessKind({ mimeType: 'application/vnd.api+json' })?.kind).toBe('json')
    expect(guessKind({ mimeType: 'text/html' })?.kind).toBe('html')
    expect(guessKind({ mimeType: 'video/mp4' })?.kind).toBe('video')
    expect(guessKind({ mimeType: 'audio/wav' })?.kind).toBe('audio')
  })

  it('falls back to the extension when the type is generic', () => {
    expect(guessKind({ mimeType: 'application/octet-stream', url: '/a/b.xlsx' })?.kind).toBe('xlsx')
    expect(guessKind({ fileName: 'notes.md' })?.kind).toBe('markdown')
    expect(guessKind({ fileName: 'clip.mp4' })?.kind).toBe('video')
    expect(guessKind({ fileName: 'track.mp3' })?.kind).toBe('audio')
    expect(guessKind({ fileName: 'export.csv' })?.kind).toBe('csv')
  })

  it('recognises legacy Office without reading a byte', () => {
    const result = guessKind({ url: '/archive/report.doc' })
    expect(result?.kind).toBe('unsupported')
    expect(result?.unsupportedReason).toBe('legacy-office')
  })

  it('returns null when only the bytes can decide', () => {
    // A blob endpoint with no extension and no useful type — the placeholder
    // stays neutral rather than asserting a format it cannot know.
    expect(guessKind({ mimeType: 'application/octet-stream', url: '/blob/abc' })).toBeNull()
    expect(guessKind({})).toBeNull()
  })

  it('agrees with resolveKind wherever it commits to an answer', async () => {
    const cases = [
      { mimeType: 'application/pdf', url: '/a.pdf' },
      { mimeType: 'application/octet-stream', url: '/a.pptx' },
      { mimeType: 'text/plain', url: '/a.md' },
      { mimeType: 'application/msword', url: '/a.doc' },
      { mimeType: 'image/svg+xml', url: '/a.svg' },
      { mimeType: 'text/html', url: '/a.html' },
      { mimeType: 'application/octet-stream', url: '/a.mp4' },
      { mimeType: 'application/octet-stream', url: '/a.wav' },
      { mimeType: 'text/plain', url: '/a.csv' },
    ]
    for (const input of cases) {
      const guess = guessKind(input)
      expect(guess).not.toBeNull()
      // The sync guess is stages 1-2 of the same function; it must never
      // disagree with the full resolution, only ever be less certain.
      expect(guess).toEqual(await resolveKind(input))
    }
  })
})
