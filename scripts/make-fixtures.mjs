/**
 * Generate the demo fixtures and copy PDF.js runtime assets into public/.
 *
 * The Office files are built by hand rather than committed as binaries so the
 * fixtures stay reviewable in a diff and can be regenerated at will.
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { CT, NS, REL, contentTypes, escapeXml, px, relationships, xml } from './ooxml.mjs'
import { encodePng } from './png.mjs'
import { encodeTiff } from './tiff.mjs'
import { encodeWav } from './wav.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'examples/demo/public/fixtures')
const publicDir = resolve(root, 'examples/demo/public')

await mkdir(out, { recursive: true })

/* ------------------------------------------------------------------ text */

await writeFile(
  resolve(out, 'sample.txt'),
  [
    'doc-preview plain text fixture',
    '='.repeat(30),
    '',
    'Tab\tseparated\tcolumns line up when wrapping is off.',
    'A deliberately long line follows so the wrap toggle has something to do: ' +
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ' +
      'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.',
    '',
    ...Array.from({ length: 40 }, (_, i) => `line ${String(i + 1).padStart(3, '0')}  ·  value ${(i * 37) % 101}`),
  ].join('\n'),
)

/* -------------------------------------------------------------- markdown */

await writeFile(
  resolve(out, 'sample.md'),
  `# Markdown fixture

Rendered with **react-markdown**, GFM enabled, and \`rehype-sanitize\` guarding
against untrusted HTML.

## Formatting

*Emphasis*, **strong**, ~~struck through~~, \`inline code\`, and a [link](https://example.com).

> A blockquote, for the vertical rhythm.

## Table

| Format | Library | Fidelity |
| ------ | ------- | -------: |
| PDF    | pdfjs-dist | High |
| DOCX   | docx-preview | High |
| XLSX   | exceljs | High |
| PPTX   | pptxtojson | ~80% |

## Task list

- [x] Detect the format from bytes
- [x] Sanitize untrusted markup
- [ ] Ship it

## Code

\`\`\`ts
const kind = await resolveKind({ mimeType, url, data })
\`\`\`

## Injection check

The next line is raw HTML and must render inert, not execute:

<img src=x onerror="alert('xss')">
`,
)

/* ---------------------------------------------------------------- images */

// A gradient with transparent corners and a fine grid: the transparency shows
// the checkerboard is working, and the 1px grid shows whether zoom is really
// magnifying pixels rather than smoothing them.
await writeFile(
  resolve(out, 'sample.png'),
  encodePng(800, 600, (x, y) => {
    const cornerRadius = 90
    const near = (cx, cy) => Math.hypot(x - cx, y - cy) < cornerRadius
    if (near(0, 0) || near(800, 0) || near(0, 600) || near(800, 600)) return [0, 0, 0, 0]

    const grid = x % 40 === 0 || y % 40 === 0
    if (grid) return [255, 255, 255, 90]

    return [
      Math.round(30 + (x / 800) * 200),
      Math.round(60 + (y / 600) * 120),
      Math.round(200 - (x / 800) * 120),
      255,
    ]
  }),
)

// Small, so "Fit" must not scale it up and 1:1 is visibly tiny.
await writeFile(
  resolve(out, 'icon.png'),
  encodePng(32, 32, (x, y) => {
    const d = Math.hypot(x - 16, y - 16)
    if (d > 15) return [0, 0, 0, 0]
    return d > 11 ? [37, 99, 235, 255] : [255, 192, 0, 255]
  }),
)

// Vector, and also the case that used to be reported as unsupported.
await writeFile(
  resolve(out, 'sample.svg'),
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="480" height="320">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="480" height="320" rx="18" fill="url(#g)"/>
  <circle cx="120" cy="110" r="58" fill="#ffc000"/>
  <path d="M60 250 L180 150 L260 220 L360 120 L430 190" fill="none" stroke="#fff" stroke-width="9"
        stroke-linecap="round" stroke-linejoin="round"/>
  <text x="240" y="295" fill="#fff" font-family="sans-serif" font-size="22" text-anchor="middle">
    Vector fixture
  </text>
</svg>
`,
)

// A real image only Safari can decode, so everywhere else it exercises the
// renderer's "this browser cannot display it" path.
await writeFile(
  resolve(out, 'sample.tiff'),
  encodeTiff(240, 160, (x, y) => [Math.round((x / 240) * 255), Math.round((y / 160) * 255), 140]),
)

// Same PNG bytes, opaque name and generic type: detection must use the signature.
await writeFile(resolve(out, 'picture.bin'), await readFile(resolve(out, 'sample.png')))

/* ------------------------------------------------------------ json / xml */

// Written minified so the pretty-printer has something to actually do.
await writeFile(
  resolve(out, 'sample.json'),
  JSON.stringify({
    name: 'doc-preview',
    version: '0.1.0',
    offline: true,
    formats: [
      { kind: 'pdf', engine: 'pdfjs-dist', fidelity: 'high', pages: 2 },
      { kind: 'docx', engine: 'OfficeCLI (WASM)', fidelity: 'high', pages: null },
      { kind: 'xlsx', engine: 'OfficeCLI (WASM)', formulas: true, sheets: 3 },
      { kind: 'pptx', engine: 'OfficeCLI (WASM)', slides: 3 },
      { kind: 'json', engine: 'built-in', prettyPrinted: true },
    ],
    limits: { maxBytes: 104857600, legacyOffice: false, encrypted: false },
    notes: 'Values below exercise escaping: "quoted", \\backslash\\, tab\\there, emoji \u{1F4C4}.',
    nested: { a: { b: { c: { d: [1, -2.5, 3e4, true, false, null] } } } },
  }),
)

await writeFile(
  resolve(out, 'sample.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>' +
    '<!-- A deliberately unindented document, so formatting is visible --><catalogue xmlns:dc="http://purl.org/dc/elements/1.1/" updated="2026-09-05">' +
    '<document id="1" kind="pdf"><dc:title>PDF fixture</dc:title><engine pages="2">pdfjs-dist</engine>' +
    '<description>Rendered on a canvas with a <emphasis>selectable</emphasis> text layer over it.</description></document>' +
    '<document id="2" kind="xlsx"><dc:title>Spreadsheet fixture</dc:title><engine formulas="true">OfficeCLI</engine>' +
    '<escaped>Ampersand &amp; angle &lt;brackets&gt; must survive a round trip.</escaped>' +
    '<![CDATA[Raw <not markup> & untouched]]></document>' +
    '<empty/><document id="3" kind="pptx"><dc:title>Deck fixture</dc:title><engine slides="3">OfficeCLI</engine></document>' +
    '</catalogue>',
)

// Same JSON, opaque name and generic type: forces the content sniffer to decide.
await writeFile(
  resolve(out, 'payload.bin'),
  await readFile(resolve(out, 'sample.json')),
)

/* ----------------------------------------------------------------- html */

await writeFile(
  resolve(out, 'sample.html'),
  `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>HTML fixture</title>
<style>
  body { font-family: sans-serif; margin: 0; padding: 24px; color: #1b1d21; }
  h1 { color: #2563eb; }
  .card { border: 1px solid #d8dbe0; border-radius: 8px; padding: 16px; margin-top: 16px; }
</style>
</head>
<body>
<h1>doc-preview HTML fixture</h1>
<p>Rendered in a sandboxed same-origin iframe, sanitised with DOMPurify.</p>
<div class="card">
  <p>The embedded &lt;style&gt; block above should still apply here.</p>
</div>
<p>Injection check — the next line must render inert, not execute:</p>
<img src="x" onerror="window.__xss = true">
<script>window.__xss = true</script>
</body>
</html>
`,
)

/* ---------------------------------------------------------- video / audio */

// A one-second tone with a short fade in/out to avoid a click at the edges —
// real, decodable PCM audio every browser can play.
await writeFile(
  resolve(out, 'sample.wav'),
  encodeWav(1, 44100, (t) => {
    const fade = Math.min(1, t * 20, (1 - t) * 20)
    return Math.sin(2 * Math.PI * 440 * t) * fade
  }),
)

// Only the WebM signature — a real container magic number, but not a decodable
// stream. Hand-rolling a genuinely playable video byte-for-byte (a real VP8/VP9
// bitstream inside a full Matroska structure) is a different order of work than
// PNG/TIFF/WAV, so this exercises the renderer's "cannot play" path instead —
// the same strategy the TIFF fixture already uses for its unsupported browsers.
await writeFile(resolve(out, 'sample.webm'), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(32).fill(0)]))

/* ------------------------------------------------------------------- csv */

// A quoted field with an embedded comma and a decimal exercise the parser;
// the fixture is intentionally clean (uniform column counts) so the demo
// opens on the table view rather than the ragged-input fallback.
await writeFile(
  resolve(out, 'sample.csv'),
  [
    'Region,Rep,"Deal, note",Revenue',
    'North,"Lee, A.",Renewed on time,128400.50',
    'South,Patel,New logo,96251.75',
    'East,"Chen, R.",Upsell,154300.00',
  ].join('\n'),
)

/* ------------------------------------------------------------------- pdf */

await writeFile(resolve(out, 'sample.pdf'), buildPdf())

function buildPdf() {
  const pageText = (title, body) =>
    `BT /F1 24 Tf 72 700 Td (${title}) Tj ET\n` +
    body.map((line, i) => `BT /F1 12 Tf 72 ${660 - i * 18} Td (${line}) Tj ET`).join('\n')

  const streams = [
    pageText('doc-preview PDF fixture', [
      'Page one. This text lives in the text layer, so it can be',
      'selected and found with the browser search.',
      'Zoom and fit-to-width operate on the rendered canvas.',
    ]),
    pageText('Second page', [
      'Pages render lazily as they approach the viewport.',
      'The page indicator follows the scroll position.',
    ]),
  ]

  const objects = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>`
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>'
  objects[4] = `<< /Length ${streams[0].length} >>\nstream\n${streams[0]}\nendstream`
  objects[5] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>'
  objects[6] = `<< /Length ${streams[1].length} >>\nstream\n${streams[1]}\nendstream`
  objects[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  // Offsets must be byte-exact or the reader rejects the file, so the body is
  // assembled first and the xref table is built from the measured positions.
  let body = '%PDF-1.4\n'
  const offsets = []
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(body)
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = Buffer.byteLength(body)
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(body + xref + trailer, 'latin1')
}

/* ------------------------------------------------------------------ xlsx */

{
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Q3 Summary')

  // The merged title is added up front rather than spliced in afterwards:
  // `spliceRows` shifts rows without rewriting formula ranges, which left the
  // file holding a SUM over the wrong rows and a cached result that disagreed
  // with it. Renderers that evaluate formulas then disagree with renderers that
  // trust the cache — and both are right.
  sheet.addRow(['Regional performance, Q3 2026'])
  sheet.mergeCells('A1:E1')
  sheet.getCell('A1').font = { bold: true, size: 14 }
  sheet.getCell('A1').alignment = { horizontal: 'center' }

  sheet.columns = [
    { key: 'region', width: 18 },
    { key: 'opened', width: 14 },
    { key: 'revenue', width: 16 },
    { key: 'margin', width: 12 },
    { key: 'units', width: 14 },
  ]

  const headerRow = sheet.addRow(['Region', 'Opened', 'Revenue', 'Margin', 'Units'])
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }

  const rows = [
    ['North', new Date('2026-07-14'), 128400.5, 0.412, 1820],
    ['South', new Date('2026-07-21'), 96250.75, 0.298, 1344],
    ['East', new Date('2026-08-03'), 154900, 0.455, 2210],
    ['West', new Date('2026-08-19'), 88130.25, 0.267, 1195],
    ['Central', new Date('2026-09-01'), 112705.1, 0.383, 1601],
  ]
  for (const row of rows) sheet.addRow(row)

  // Formats the renderer must apply: without numfmt these show as raw serials
  // and unrounded floats.
  sheet.getColumn('opened').numFmt = 'dd mmm yyyy'
  sheet.getColumn('revenue').numFmt = '$#,##0.00'
  sheet.getColumn('margin').numFmt = '0.0%'
  sheet.getColumn('units').numFmt = '#,##0'

  // Ranges are derived from where the data actually landed, so the cached
  // results and the formulas agree however the sheet above them changes.
  const firstDataRow = headerRow.number + 1
  const lastDataRow = firstDataRow + rows.length - 1
  const sumOf = (column, index) => ({
    formula: `SUM(${column}${firstDataRow}:${column}${lastDataRow})`,
    result: rows.reduce((total, row) => total + row[index], 0),
  })

  const totalRow = sheet.addRow(['Total', null, sumOf('C', 2), null, sumOf('E', 4)])
  totalRow.font = { bold: true }
  sheet.getCell(`C${totalRow.number}`).numFmt = '$#,##0.00'
  sheet.getCell(`E${totalRow.number}`).numFmt = '#,##0'

  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }]

  const notes = wb.addWorksheet('Notes')
  notes.getCell('A1').value = 'Second sheet, to exercise the sheet tab bar.'
  notes.getCell('A3').value = 'Wrapped text in a single cell: ' + 'lorem ipsum '.repeat(6)
  notes.getCell('A3').alignment = { wrapText: true }
  notes.getColumn(1).width = 60

  const wide = wb.addWorksheet('Large')
  wide.getCell('A1').value = 'Row count exceeds the virtualisation threshold.'
  for (let i = 2; i <= 2000; i += 1) {
    wide.getRow(i).values = [`row ${i}`, i, i * 1.5, new Date(2026, 0, (i % 28) + 1)]
  }
  wide.getColumn(4).numFmt = 'yyyy-mm-dd'

  await writeFile(resolve(out, 'sample.xlsx'), Buffer.from(await wb.xlsx.writeBuffer()))
}

/* ------------------------------------------------------------------ docx */

{
  const zip = new JSZip()
  const para = (text, opts = {}) => {
    const runProps = [
      opts.bold ? '<w:b/>' : '',
      opts.italic ? '<w:i/>' : '',
      opts.size ? `<w:sz w:val="${opts.size * 2}"/>` : '',
      opts.color ? `<w:color w:val="${opts.color}"/>` : '',
    ].join('')
    const paraProps = opts.style ? `<w:pPr><w:pStyle w:val="${opts.style}"/></w:pPr>` : ''
    return `<w:p>${paraProps}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
  }

  const tableRow = (cells, header = false) =>
    `<w:tr>${cells
      .map(
        (cell) =>
          `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:fill="E8EDF5"/>' : ''}</w:tcPr>${para(cell, { bold: header })}</w:tc>`,
      )
      .join('')}</w:tr>`

  const body =
    para('doc-preview Word fixture', { style: 'Heading1', bold: true, size: 22 }) +
    para(
      'Rendered by docx-preview inside a sandboxed same-origin iframe, so the stylesheet it injects cannot leak into the host application.',
    ) +
    para('Character formatting', { style: 'Heading2', bold: true, size: 16 }) +
    para('Bold text in a paragraph.', { bold: true }) +
    para('Italic text in a paragraph.', { italic: true }) +
    para('Coloured text in a paragraph.', { color: 'C0392B' }) +
    para('A table', { style: 'Heading2', bold: true, size: 16 }) +
    `<w:tbl><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((side) => `<w:${side} w:val="single" w:sz="6" w:color="B4BCC6"/>`)
      .join('')}</w:tblBorders></w:tblPr>` +
    tableRow(['Format', 'Library', 'Notes'], true) +
    tableRow(['PDF', 'pdfjs-dist', 'Canvas plus text layer']) +
    tableRow(['DOCX', 'docx-preview', 'Paginated']) +
    tableRow(['XLSX', 'exceljs', 'Formatted via numfmt']) +
    '</w:tbl>' +
    para('Page two', { style: 'Heading2', bold: true, size: 16 }) +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    para('This paragraph is after an explicit page break, so pagination is visible in the preview.') +
    Array.from({ length: 12 }, (_, i) =>
      para(`Filler paragraph ${i + 1}. ${'The quick brown fox jumps over the lazy dog. '.repeat(3)}`),
    ).join('')

  zip.file(
    '[Content_Types].xml',
    contentTypes(
      `<Override PartName="/word/document.xml" ContentType="${CT.doc}"/><Override PartName="/word/styles.xml" ContentType="${CT.styles}"/>`,
    ),
  )
  zip.file('_rels/.rels', relationships([{ id: 'rId1', type: REL.officeDocument, target: 'word/document.xml' }]))
  zip.file(
    'word/_rels/document.xml.rels',
    relationships([{ id: 'rId1', type: REL.styles, target: 'styles.xml' }]),
  )
  zip.file(
    'word/document.xml',
    xml(
      `<w:document xmlns:w="${NS.w}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
    ),
  )
  zip.file(
    'word/styles.xml',
    xml(
      `<w:styles xmlns:w="${NS.w}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr></w:style></w:styles>`,
    ),
  )

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await writeFile(resolve(out, 'sample.docx'), buffer)
  // Same bytes, opaque name and type: forces detection down to the magic-byte path.
  await writeFile(resolve(out, 'mislabelled.bin'), buffer)
}

/* ------------------------------------------------------------------ pptx */

await writeFile(resolve(out, 'sample.pptx'), await buildPptx())

async function buildPptx() {
  const zip = new JSZip()
  const W = 960
  const H = 540

  const textBody = (text, { size = 18, bold = false, color = '1B1D21', align = 'l' } = {}) =>
    `<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>` +
    text
      .split('\n')
      .map(
        (line) =>
          `<a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="en-US" sz="${size * 100}" b="${bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
      )
      .join('') +
    `</p:txBody>`

  const shape = (id, name, { x, y, w, h }, body, fill) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${px(x)}" y="${px(y)}"/><a:ext cx="${px(w)}" cy="${px(h)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>') +
    `</p:spPr>${body}</p:sp>`

  const slideXml = (shapes, bg) =>
    xml(
      `<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld>` +
        (bg ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` : '') +
        `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
        shapes +
        `</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`,
    )

  const slide1 =
    shape(2, 'Title', { x: 80, y: 140, w: 800, h: 90 }, textBody('doc-preview PowerPoint fixture', { size: 40, bold: true, color: 'FFFFFF' })) +
    shape(3, 'Subtitle', { x: 80, y: 250, w: 800, h: 60 }, textBody('Parsed with pptxtojson, rendered as positioned DOM', { size: 20, color: 'D6E4FF' })) +
    shape(4, 'Accent', { x: 80, y: 330, w: 160, h: 6 }, textBody(''), 'FFC000')

  const slide2 =
    shape(2, 'Heading', { x: 60, y: 50, w: 840, h: 60 }, textBody('Shapes, colours and alignment', { size: 30, bold: true })) +
    shape(3, 'BoxA', { x: 60, y: 150, w: 250, h: 150 }, textBody('Filled shape\nwith wrapped text', { size: 16, color: 'FFFFFF', align: 'ctr' }), '2563EB') +
    shape(4, 'BoxB', { x: 350, y: 150, w: 250, h: 150 }, textBody('Second box', { size: 16, color: 'FFFFFF', align: 'ctr' }), '16A34A') +
    shape(5, 'BoxC', { x: 640, y: 150, w: 250, h: 150 }, textBody('Third box', { size: 16, color: 'FFFFFF', align: 'ctr' }), 'DC2626') +
    shape(6, 'Footer', { x: 60, y: 340, w: 840, h: 120 }, textBody(
      'Text alignment, font sizes and fill colours come through the parser as\nstructured values, which the renderer maps onto CSS.', { size: 16 }))

  const slide3 =
    shape(2, 'Heading', { x: 60, y: 50, w: 840, h: 60 }, textBody('A table', { size: 30, bold: true })) +
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${px(60)}" y="${px(150)}"/><a:ext cx="${px(840)}" cy="${px(240)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>` +
    `<a:tblPr firstRow="1"/><a:tblGrid>${[280, 280, 280].map((w) => `<a:gridCol w="${px(w)}"/>`).join('')}</a:tblGrid>` +
    [
      ['Format', 'Library', 'Fidelity'],
      ['PDF', 'pdfjs-dist', 'High'],
      ['DOCX', 'docx-preview', 'High'],
      ['PPTX', 'pptxtojson', 'Approximate'],
    ]
      .map(
        (row, i) =>
          `<a:tr h="${px(48)}">${row
            .map(
              (cell) =>
                `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400" b="${i === 0 ? 1 : 0}"/><a:t>${escapeXml(cell)}</a:t></a:r></a:p></a:txBody><a:tcPr>${i === 0 ? '<a:solidFill><a:srgbClr val="E8EDF5"/></a:solidFill>' : ''}</a:tcPr></a:tc>`,
            )
            .join('')}</a:tr>`,
      )
      .join('') +
    `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`

  const slides = [
    { xml: slideXml(slide1, '1E3A8A'), note: 'Opening slide. The speaker notes panel reads this text from the notes slide part.' },
    { xml: slideXml(slide2), note: 'Three coloured boxes exercise fills, alignment and multi-line text.' },
    { xml: slideXml(slide3), note: '' },
  ]

  zip.file(
    '[Content_Types].xml',
    contentTypes(
      `<Override PartName="/ppt/presentation.xml" ContentType="${CT.pres}"/>` +
        `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT.slideMaster}"/>` +
        `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT.slideLayout}"/>` +
        `<Override PartName="/ppt/theme/theme1.xml" ContentType="${CT.theme}"/>` +
        slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT.slide}"/>`).join('') +
        slides
          .map((s, i) => (s.note ? `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="${CT.notesSlide}"/>` : ''))
          .join(''),
    ),
  )

  zip.file('_rels/.rels', relationships([{ id: 'rId1', type: REL.officeDocument, target: 'ppt/presentation.xml' }]))

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    relationships([
      { id: 'rId1', type: REL.slideMaster, target: 'slideMasters/slideMaster1.xml' },
      ...slides.map((_, i) => ({ id: `rId${i + 2}`, type: REL.slide, target: `slides/slide${i + 1}.xml` })),
      { id: `rId${slides.length + 2}`, type: REL.theme, target: 'theme/theme1.xml' },
    ]),
  )

  zip.file(
    'ppt/presentation.xml',
    xml(
      `<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">` +
        `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
        `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst>` +
        `<p:sldSz cx="${px(W)}" cy="${px(H)}"/><p:notesSz cx="${px(H)}" cy="${px(W)}"/>` +
        `</p:presentation>`,
    ),
  )

  slides.forEach((slide, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slide.xml)
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      relationships([
        { id: 'rId1', type: REL.slideLayout, target: '../slideLayouts/slideLayout1.xml' },
        ...(slide.note
          ? [{ id: 'rId2', type: REL.notesSlide, target: `../notesSlides/notesSlide${i + 1}.xml` }]
          : []),
      ]),
    )
    if (slide.note) {
      zip.file(
        `ppt/notesSlides/notesSlide${i + 1}.xml`,
        xml(
          `<p:notes xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree>` +
            `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
            `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>` +
            `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escapeXml(slide.note)}</a:t></a:r></a:p></p:txBody></p:sp>` +
            `</p:spTree></p:cSld></p:notes>`,
        ),
      )
      zip.file(
        `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`,
        relationships([{ id: 'rId1', type: REL.slide, target: `../slides/slide${i + 1}.xml` }]),
      )
    }
  })

  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    xml(
      `<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>` +
        `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
        `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    ),
  )
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    relationships([{ id: 'rId1', type: REL.slideMaster, target: '../slideMasters/slideMaster1.xml' }]),
  )

  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    xml(
      `<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>` +
        `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
        `</p:spTree></p:cSld>` +
        `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
        `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
    ),
  )
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    relationships([
      { id: 'rId1', type: REL.slideLayout, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: REL.theme, target: '../theme/theme1.xml' },
    ]),
  )

  const schemeColors = ['1B1D21', 'FFFFFF', '44546A', 'E7E6E6', '2563EB', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47']
  const schemeNames = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
  zip.file(
    'ppt/theme/theme1.xml',
    xml(
      `<a:theme xmlns:a="${NS.a}" name="doc-preview"><a:themeElements><a:clrScheme name="doc-preview">` +
        schemeNames.map((n, i) => `<a:${n}><a:srgbClr val="${schemeColors[i]}"/></a:${n}>`).join('') +
        `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>` +
        `<a:fontScheme name="doc-preview"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
        `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
        `<a:fmtScheme name="doc-preview"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
        `<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
        `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
        `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>` +
        `</a:themeElements></a:theme>`,
    ),
  )

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/* ---------------------------------------------------------- legacy .doc */

{
  // An OLE2 compound-file header is enough to exercise the legacy-format path.
  const header = Buffer.alloc(1536)
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0)
  await writeFile(resolve(out, 'legacy.doc'), header)
}

/* ------------------------------------------------- pdf.js runtime assets */

// PDF.js needs these served from the app's own origin. Copying them into
// public/ is what keeps the viewer working with the network switched off.

const pdfjs = resolve(root, 'node_modules/pdfjs-dist')
await mkdir(resolve(publicDir, 'pdfjs'), { recursive: true })
await cp(resolve(pdfjs, 'cmaps'), resolve(publicDir, 'pdfjs/cmaps'), { recursive: true })
await cp(resolve(pdfjs, 'standard_fonts'), resolve(publicDir, 'pdfjs/standard_fonts'), { recursive: true })

console.log('fixtures written to', out)
console.log('pdf.js cmaps + standard_fonts copied to', resolve(publicDir, 'pdfjs'))
