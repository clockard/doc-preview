/**
 * Drive the built demo in a real browser and assert every format renders.
 *
 * With --offline, every request to a host other than the local server is failed
 * outright, so anything reaching for a CDN shows up as a broken preview rather
 * than passing quietly on a developer machine that happens to have a network.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4173
const BASE = process.env.SMOKE_URL ?? `http://127.0.0.1:${PORT}`

/**
 * Serve the built demo for the duration of the run.
 *
 * Set SMOKE_URL to point at a server you are already running (the dev server,
 * say) and this is skipped.
 */
async function startPreview() {
  if (process.env.SMOKE_URL) return null

  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    { cwd: resolve(root, 'examples/demo'), stdio: 'ignore' },
  )

  const deadline = Date.now() + 30000
  for (;;) {
    if (Date.now() > deadline) {
      server.kill()
      throw new Error(`The preview server did not come up on port ${PORT}.`)
    }
    try {
      const response = await fetch(BASE)
      if (response.ok) return server
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 300))
  }
}

const server = await startPreview()
const stopPreview = () => server?.kill()
process.on('exit', stopPreview)
process.on('SIGINT', () => {
  stopPreview()
  process.exit(130)
})

/**
 * `ready` is waited for rather than sampled: the kind attribute flips as soon as
 * the document is identified, well before the renderer has painted, so a
 * snapshot assertion at that moment races the render.
 */
const CASES = [
  { label: 'PDF', kind: 'pdf', ready: '.dp-pdf__canvas' },
  { label: 'Word', kind: 'docx', ready: '.dp-docx__frame' },
  { label: 'Excel', kind: 'xlsx', ready: '.dp-xlsx__cell' },
  { label: 'PowerPoint', kind: 'pptx', ready: '.dp-pptx__stage' },
  { label: 'Markdown', kind: 'markdown', ready: '.dp-markdown__body h1' },
  { label: 'PNG', kind: 'image', ready: '.dp-image__img' },
  { label: 'SVG', kind: 'image', ready: '.dp-image__img' },
  { label: 'Small icon', kind: 'image', ready: '.dp-image__img' },
  // Detected as an image, then reported as undecodable — no <img> is expected.
  { label: 'TIFF', kind: 'image', ready: 'text=/cannot display/' },
  { label: 'JSON', kind: 'json', ready: '.dp-tok--key' },
  { label: 'XML', kind: 'xml', ready: '.dp-tok--tag' },
  { label: 'HTML', kind: 'html', ready: '.dp-html__frame' },
  { label: 'Audio', kind: 'audio', ready: '.dp-media__audio' },
  // Real container signature, undecodable stream — same strategy as TIFF.
  { label: 'Video', kind: 'video', ready: 'text=/cannot play/' },
  { label: 'CSV', kind: 'csv', ready: '.dp-csv__table' },
  { label: 'Plain text', kind: 'text', ready: '.dp-text__pre' },
  { label: 'Mislabelled .docx', kind: 'docx', ready: '.dp-docx__frame' },
  { label: 'Sniffed JSON', kind: 'json', ready: '.dp-tok--key' },
  { label: 'Sniffed PNG', kind: 'image', ready: '.dp-image__img' },
  { label: 'Legacy .doc', kind: 'unsupported', ready: 'text=/Legacy Office files/' },
]

const offline = process.argv.includes('--offline')
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext()

const offsite = []
if (offline) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    const local = `${url.protocol}//${url.host}` === BASE || url.protocol === 'data:' || url.protocol === 'blob:'
    if (local) return route.continue()
    offsite.push(route.request().url())
    return route.abort('failed')
  })
}

const page = await context.newPage()
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(String(err)))

// networkidle never settles against a Vite preview server; wait for the app instead.
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.demo__chip')

let failures = 0

function check(name, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(21)} -> ${detail}`)
  if (!ok) failures += 1
}

/* ------------------------------------------------ every format renders */

for (const testCase of CASES) {
  await page.getByRole('button', { name: testCase.label, exact: true }).click()
  try {
    await page.waitForSelector(`.dp-root[data-kind="${testCase.kind}"]`, { timeout: 20000 })
    await page.waitForSelector(testCase.ready, { timeout: 20000 })
    console.log(`  PASS  ${testCase.label.padEnd(21)} -> ${testCase.kind}`)
  } catch (err) {
    failures += 1
    const kind = await page.locator('.dp-root').getAttribute('data-kind').catch(() => '?')
    console.log(`  FAIL  ${testCase.label.padEnd(21)} -> got kind=${kind}: ${err.message.split('\n')[0]}`)
  }
}

/* ---------------------------------------------------------------- pdf */

await page.getByRole('button', { name: 'PDF', exact: true }).click()
await page.waitForSelector('.dp-pdf__canvas')
// Give the intersection observers a tick to settle: the indicator briefly saw
// every prefetched page before the topmost-page fix.
await page.waitForTimeout(1500)
const pdfCounter = (await page.locator('.dp-pdf .dp-toolbar__text').first().innerText()).trim()
const canvasBox = await page.locator('.dp-pdf__canvas').first().boundingBox()
check('pdf paging + canvas', pdfCounter === '1 / 2' && (canvasBox?.width ?? 0) > 100, `${pdfCounter}, ${Math.round(canvasBox?.width ?? 0)}px wide`)

// Selectable text means the text layer was built, not just the canvas.
const pdfText = await page.locator('.dp-pdf__text').first().innerText()
check('pdf text layer', /doc-preview PDF fixture/.test(pdfText), JSON.stringify(pdfText.replace(/\s+/g, ' ').trim().slice(0, 40)))

/*
 * Search exists because pages are virtualised: the browser's native Ctrl+F
 * cannot find a match on a page that has not rendered yet, so this proves
 * the custom search does what it exists for — locate and jump to one.
 */
await page.getByRole('button', { name: 'Find in document' }).click()
await page.getByPlaceholder('Find in document').fill('page')
await page.waitForSelector('.dp-pdf__highlight')
const crossPageStatus = (await page.locator('.dp-pdf .dp-toolbar__text--wide').innerText()).trim()
check('pdf search finds cross-page matches', crossPageStatus === '1 / 2 pages', crossPageStatus)

// "page" matches on both pages; the first match is page 1, so advancing to
// the second must actually scroll to page 2 — the page that was not rendered
// when the search began.
await page.getByRole('button', { name: 'Next match' }).click()
await page.waitForFunction(() => document.querySelector('.dp-pdf .dp-toolbar__text')?.textContent?.trim() === '2 / 2')
const highlightBox = await page.locator('.dp-pdf__highlight').first().boundingBox()
check(
  'pdf search jumps to and highlights an unrendered page',
  (highlightBox?.width ?? 0) > 5 && (highlightBox?.height ?? 0) > 5,
  `${Math.round(highlightBox?.width ?? 0)}x${Math.round(highlightBox?.height ?? 0)}px`,
)

// The highlight must sit over the actual glyph, not just anywhere on the
// page — this is what the --total-scale-factor text-layer fix guarantees.
const alignment = await page.evaluate(() => {
  const page = document.querySelector('[data-page="2"]')
  const mark = page?.querySelector('.dp-pdf__highlight')
  const spans = [...(page?.querySelectorAll('.dp-pdf__text span') ?? [])]
  const target = spans.find((s) => /page/i.test(s.textContent ?? ''))
  if (!mark || !target) return null
  const m = mark.getBoundingClientRect()
  const s = target.getBoundingClientRect()
  // The highlight's vertical band must sit close to the matched span's box —
  // some slack for ordinary line-height padding around the glyph's own ink
  // extents, but nowhere near the ~150px offset the missing font-size/scaleX
  // rules used to produce.
  return Math.abs(m.top - s.top) < 10 && Math.abs(m.bottom - s.bottom) < 10
})
check('pdf search highlight is vertically aligned with its glyph', alignment === true, String(alignment))

await page.getByPlaceholder('Find in document').fill('xyzzy-no-such-word')
await page.waitForFunction(() => /No matches/.test(document.querySelector('.dp-pdf .dp-toolbar__text--wide')?.textContent ?? ''))
check('pdf search reports no matches', true, 'shown after an unmatched query')

const searchInput = page.getByPlaceholder('Find in document')
await searchInput.fill('page')
await page.waitForFunction(() => document.querySelector('.dp-pdf .dp-toolbar__text--wide')?.textContent?.trim() === '1 / 2 pages')
await searchInput.press('Enter')
await page.waitForFunction(() => document.querySelector('.dp-pdf .dp-toolbar__text--wide')?.textContent?.trim() === '2 / 2 pages')
await searchInput.press('Shift+Enter')
const wrapped = (await page.locator('.dp-pdf .dp-toolbar__text--wide').innerText()).trim()
check('pdf search Enter/Shift+Enter step through matches', wrapped === '1 / 2 pages', wrapped)

await searchInput.press('Escape')
const closedByEscape = (await page.locator('.dp-pdf__search-input').count()) === 0
check('pdf search Escape closes it', closedByEscape, `input present=${!closedByEscape}`)

await page.getByRole('button', { name: 'Find in document' }).click()
await page.getByPlaceholder('Find in document').fill('page')
await page.waitForSelector('.dp-pdf__highlight')
await page.getByRole('button', { name: 'Close search' }).click()
const searchClosed = (await page.locator('.dp-pdf__search-input').count()) === 0
check('pdf search close button closes it', searchClosed, `input present=${!searchClosed}`)

/* ------------------------------------------------------------- office */

// The docx iframe must contain real rendered content, not just exist.
await page.getByRole('button', { name: 'Word', exact: true }).click()
await page.waitForSelector('.dp-docx__frame')
const docxText = await page
  .frameLocator('.dp-docx__frame')
  .locator('body')
  .innerText()
  .catch(() => '')
check('docx content', /doc-preview Word fixture/.test(docxText) && /docx-preview/.test(docxText), JSON.stringify(docxText.replace(/\s+/g, ' ').trim().slice(0, 40)))

await page.getByRole('button', { name: 'Excel', exact: true }).click()
await page.waitForSelector('.dp-xlsx__cell')
const sheetTabs = await page.locator('.dp-xlsx__tab').allInnerTexts()
check('xlsx sheet tabs', sheetTabs.length === 3, sheetTabs.join(', '))

// Number formats must be applied: ExcelJS reports them but never applies them,
// so without numfmt these show as raw serials and unrounded floats.
const dataRow = await page.locator('.dp-xlsx__table tbody tr').nth(2).innerText()
const formatted = /14 Jul 2026/.test(dataRow) && /\$128,400\.50/.test(dataRow) && /41\.2%/.test(dataRow)
check('xlsx formatting', formatted, dataRow.replace(/\s+/g, ' ').trim().slice(0, 56))

// The formula row shows the cached result, which must agree with the formula.
const totalRow = await page.locator('.dp-xlsx__table tbody tr').last().innerText()
check('xlsx formula total', /\$580,386\.60/.test(totalRow), totalRow.replace(/\s+/g, ' ').trim().slice(0, 44))

await page.getByRole('button', { name: 'PowerPoint', exact: true }).click()
await page.waitForSelector('.dp-pptx__stage')
await page.getByRole('button', { name: 'Next slide' }).click()
const slideCounter = (await page.locator('.dp-pptx .dp-toolbar__text').first().innerText()).trim()
check('pptx slide navigation', slideCounter === '2 / 3', slideCounter)

// Slide text must fit its shape after the shrink-to-fit pass. Font substitution
// is guaranteed in a browser, so this is the PPTX failure mode that matters.
await page.getByRole('button', { name: 'Previous slide' }).click()
await page.waitForTimeout(400)
const overflowing = await page.locator('.dp-pptx__stage .dp-pptx__text').evaluateAll((els) =>
  els
    .map((el) => {
      const zoom = parseFloat(el.style.zoom || '1')
      const box = el.parentElement
      return { text: el.innerText.trim().slice(0, 24), zoom, over: Math.round(el.scrollHeight - box.clientHeight / zoom) }
    })
    .filter((entry) => entry.over > 2),
)
check('pptx text fits', overflowing.length === 0, `${overflowing.length} overflowing ${JSON.stringify(overflowing)}`)

// The parser emits &nbsp; for spaces, so normalise before matching.
const slideText = (await page.locator('.dp-pptx__stage').first().innerText()).replace(/\s+/g, ' ')
check('pptx title intact', /doc-preview PowerPoint fixture/.test(slideText), JSON.stringify(slideText.slice(0, 45)))

/* --------------------------------------------------------------- images */

/** naturalWidth is only non-zero once the browser has actually decoded it. */
async function imageState() {
  return page.locator('.dp-image__img').evaluate((img) => ({
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    renderedWidth: Math.round(img.getBoundingClientRect().width),
  }))
}

await page.getByRole('button', { name: 'PNG', exact: true }).click()
await page.waitForSelector('.dp-image__img')
await page.waitForFunction(() => document.querySelector('.dp-image__img')?.naturalWidth > 0)
await page.waitForTimeout(400)

// A hand-written PNG encoder is exactly the kind of thing that produces a file
// which passes a header check and still fails to decode.
const decoded = await imageState()
check('png decodes', decoded.naturalWidth === 800 && decoded.naturalHeight === 600, `${decoded.naturalWidth}x${decoded.naturalHeight} natural`)

const fitLabel = (await page.locator('.dp-image .dp-toolbar__text').nth(1).innerText()).trim()
check('image fit scale', decoded.renderedWidth < 800 && /%$/.test(fitLabel), `fit = ${fitLabel}, ${decoded.renderedWidth}px wide`)

await page.getByRole('button', { name: 'Actual size' }).click()
await page.waitForTimeout(300)
const actual = await imageState()
check('image 1:1', actual.renderedWidth === 800, `${actual.renderedWidth}px at 1:1`)

await page.getByRole('button', { name: 'Zoom in' }).click()
await page.waitForTimeout(300)
const zoomed = await imageState()
check('image zoom in', zoomed.renderedWidth > actual.renderedWidth, `${actual.renderedWidth}px -> ${zoomed.renderedWidth}px`)

await page.getByRole('button', { name: 'Zoom out' }).click()
await page.waitForTimeout(300)
check('image zoom out', (await imageState()).renderedWidth === actual.renderedWidth, 'returns to 1:1')

// Drag-to-pan, exercised for real rather than inferred from overflow: zoom well
// past the viewport, then drag and confirm the pane actually scrolled.
for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Zoom in' }).click()
await page.waitForTimeout(400)
const viewport = page.locator('.dp-image__viewport')
const overflow = await viewport.evaluate((el) => ({
  x: el.scrollWidth - el.clientWidth,
  y: el.scrollHeight - el.clientHeight,
}))
const box = await viewport.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 - 120, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(200)
const scrolled = await viewport.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }))
check('image drag to pan', overflow.x > 0 && overflow.y > 0 && (scrolled.left > 0 || scrolled.top > 0), `overflow ${overflow.x}x${overflow.y}, scrolled to ${scrolled.left},${scrolled.top}`)

// Ctrl+wheel zooms; a plain wheel must not, so an embedded preview never traps
// the page's scroll.
await page.getByRole('button', { name: 'Fit to window' }).click()
await page.waitForTimeout(300)
const beforeWheel = (await imageState()).renderedWidth
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.wheel(0, -240)
await page.waitForTimeout(300)
const afterPlainWheel = (await imageState()).renderedWidth
await page.keyboard.down('Control')
await page.mouse.wheel(0, -240)
await page.keyboard.up('Control')
await page.waitForTimeout(300)
const afterCtrlWheel = (await imageState()).renderedWidth
check('wheel zoom is ctrl-only', afterPlainWheel === beforeWheel && afterCtrlWheel > beforeWheel, `plain ${beforeWheel}->${afterPlainWheel}, ctrl ${beforeWheel}->${afterCtrlWheel}`)

// preventDefault must actually take effect, or the browser applies its own
// ctrl+wheel page zoom on top of the image zoom.
const pageZoom = await page.evaluate(() => window.visualViewport?.scale ?? 1)
check('ctrl+wheel not page zoom', Math.abs(pageZoom - 1) < 0.01, `visual viewport scale ${pageZoom}`)

// Fit must not upscale: a 32px icon should stay 32px.
await page.getByRole('button', { name: 'Small icon', exact: true }).click()
await page.waitForSelector('.dp-image__img')
await page.waitForFunction(() => document.querySelector('.dp-image__img')?.naturalWidth === 32)
await page.waitForTimeout(300)
const icon = await imageState()
check('fit never upscales', icon.renderedWidth === 32, `32px icon renders at ${icon.renderedWidth}px`)

/*
 * TIFF is a real image that only Safari decodes. Everywhere else it must fail
 * informatively — naming the format and offering the file — rather than leaving
 * an empty pane or falling back to the vague "unsupported" state.
 */
await page.getByRole('button', { name: 'TIFF', exact: true }).click()
await page.waitForSelector('text=/cannot display/')
const tiffText = (await page.locator('.dp-root').innerText()).replace(/\s+/g, ' ').trim()
const tiffDownloads = await page.locator('.dp-root a[download]').count()
check('tiff fails informatively', /image\/tiff/.test(tiffText) && tiffDownloads === 1, JSON.stringify(tiffText.slice(0, 62)))

await page.getByRole('button', { name: 'SVG', exact: true }).click()
await page.waitForSelector('.dp-image__img')
await page.waitForFunction(() => document.querySelector('.dp-image__img')?.naturalWidth > 0)
const svg = await imageState()
check('svg renders as image', svg.naturalWidth === 480 && svg.naturalHeight === 320, `${svg.naturalWidth}x${svg.naturalHeight}`)

/* ----------------------------------------------------------- json / xml */

await page.getByRole('button', { name: 'JSON', exact: true }).click()
await page.waitForSelector('.dp-code__pre')
const jsonPretty = await page.locator('.dp-code__pre').innerText()
// The fixture ships minified, so indentation proves the formatter ran.
check('json pretty-printed', jsonPretty.split('\n').length > 20 && /^  "name": "doc-preview",$/m.test(jsonPretty), `${jsonPretty.split('\n').length} lines`)
check('json highlighted', (await page.locator('.dp-tok--key').count()) > 5 && (await page.locator('.dp-tok--number').count()) > 0, `${await page.locator('.dp-tok--key').count()} keys highlighted`)

// Raw toggle must show the original single-line document.
await page.getByRole('button', { name: 'Show the original text' }).click()
const jsonRaw = await page.locator('.dp-code__pre').innerText()
check('json raw toggle', jsonRaw.split('\n').length === 1, `${jsonRaw.split('\n').length} line`)
await page.getByRole('button', { name: 'Show formatted' }).click()

await page.getByRole('button', { name: 'XML', exact: true }).click()
await page.waitForSelector('.dp-code__pre')
const xmlPretty = await page.locator('.dp-code__pre').innerText()
check('xml pretty-printed', xmlPretty.split('\n').length > 10 && /^<\?xml version="1\.0"/.test(xmlPretty), `${xmlPretty.split('\n').length} lines`)
// Escaping must survive the round trip without being doubled, and CDATA must
// come through byte-for-byte rather than being re-escaped as text.
const entitiesOk =
  xmlPretty.includes('Ampersand &amp; angle &lt;brackets&gt;') && !xmlPretty.includes('&amp;amp;')
const cdataOk = xmlPretty.includes('<![CDATA[Raw <not markup> & untouched]]>')
check('xml escaping intact', entitiesOk && cdataOk, `entities=${entitiesOk} cdata=${cdataOk}`)
check('xml mixed content', /<description>Rendered on a canvas with a <emphasis>selectable<\/emphasis>/.test(xmlPretty), 'prose not reflowed')

/* ------------------------------------------------------------ markdown */

// Untrusted markup must render inert. The markdown fixture carries an
// <img onerror> payload; sanitisation should strip the handler.
let xssFired = false
await page.exposeFunction('__xssFired', () => {
  xssFired = true
})
await page.addInitScript(() => {
  window.alert = () => window.__xssFired?.()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.demo__chip')
await page.getByRole('button', { name: 'Markdown', exact: true }).click()
await page.waitForSelector('.dp-markdown__body h1')
const handlers = await page.locator('.dp-markdown__body img').evaluateAll((imgs) =>
  imgs.map((img) => img.getAttribute('onerror')),
)
check('markdown sanitised', !xssFired && handlers.every((h) => h === null), `${handlers.length} img(s), alert fired=${xssFired}`)

/* ------------------------------------------------------------------- csv */

await page.getByRole('button', { name: 'CSV', exact: true }).click()
await page.waitForSelector('.dp-csv__table')
// If the quoted commas were treated as delimiters, these would have split
// into extra cells instead of surviving as one each.
const csvCells = await page.locator('.dp-csv__table td').allInnerTexts()
const csvHeaders = await page.locator('.dp-csv__table th').allInnerTexts()
check(
  'csv quoted comma preserved',
  csvCells.includes('Lee, A.') && csvHeaders.includes('Deal, note'),
  JSON.stringify({ headers: csvHeaders, sample: csvCells.slice(0, 4) }),
)
const csvSummary = (await page.locator('.dp-toolbar__text--wide').first().innerText()).trim()
check('csv row/column count', csvSummary === '4 rows · 4 columns', csvSummary)

/* ---------------------------------------------------------- thumbnails */

/*
 * Each tile must show its real first page, not a skeleton or a fallback icon.
 * The selector is what proves the right renderer actually painted.
 */
const THUMB_CASES = [
  { label: 'PDF', kind: 'pdf', ready: '.dp-thumb__canvas' },
  { label: 'Word', kind: 'docx', ready: '.dp-thumb__frame' },
  { label: 'Excel', kind: 'xlsx', ready: '.dp-thumb__cell' },
  { label: 'PowerPoint', kind: 'pptx', ready: '.dp-pptx__stage' },
  { label: 'Markdown', kind: 'markdown', ready: '.dp-thumb__prose h1' },
  { label: 'PNG', kind: 'image', ready: '.dp-thumb__image' },
  { label: 'SVG', kind: 'image', ready: '.dp-thumb__image' },
  { label: 'Small icon', kind: 'image', ready: '.dp-thumb__image' },
  { label: 'JSON', kind: 'json', ready: '.dp-tok--key' },
  { label: 'XML', kind: 'xml', ready: '.dp-tok--tag' },
  { label: 'HTML', kind: 'html', ready: '.dp-thumb__frame' },
  { label: 'CSV', kind: 'csv', ready: '.dp-thumb__pre' },
  { label: 'Plain text', kind: 'text', ready: '.dp-thumb__pre' },
  { label: 'Mislabelled .docx', kind: 'docx', ready: '.dp-thumb__frame' },
  { label: 'Sniffed JSON', kind: 'json', ready: '.dp-tok--key' },
  { label: 'Sniffed PNG', kind: 'image', ready: '.dp-thumb__image' },
  // No visual frame or no decodable content: these land on the fallback tile.
  // Audio's is by design (nothing to show); Legacy .doc/TIFF/Video are failures.
  { label: 'Legacy .doc', kind: 'unsupported', ready: '.dp-thumb__glyph-label' },
  { label: 'TIFF', kind: 'image', ready: '.dp-thumb__glyph-label' },
  { label: 'Audio', kind: 'audio', ready: '.dp-thumb__glyph-label' },
  { label: 'Video', kind: 'video', ready: '.dp-thumb__glyph-label' },
]

/*
 * Hold one fixture back so the slow-download case is actually exercised. Local
 * fixtures resolve almost instantly, which would let a broken placeholder pass
 * unnoticed — the whole point of the typed placeholder is the seconds before a
 * real document over a real network arrives.
 */
await page.route('**/fixtures/sample.xlsx', async (route) => {
  await new Promise((done) => setTimeout(done, 2500))
  return route.continue()
})

await page.getByRole('button', { name: 'Thumbnails \u2192' }).click()
await page.waitForSelector('.demo__grid')

// Checked while the download is still in flight, with no settling wait.
const slowTile = page.locator('.demo__tile[data-label="Excel"] .dp-thumb')
await slowTile.locator('.dp-thumb__glyph--loading').waitFor({ timeout: 5000 })
const slowState = await slowTile.evaluate((el) => ({
  state: el.dataset.state,
  kind: el.dataset.kind,
  icon: [...(el.querySelector('.dp-thumb__glyph--loading .dp-thumb__icon')?.classList ?? [])]
    .find((c) => c.startsWith('dp-thumb__icon--'))
    ?.replace('dp-thumb__icon--', ''),
  label: el.querySelector('.dp-thumb__glyph-label')?.textContent,
}))
check(
  'slow download shows typed placeholder',
  slowState.state === 'loading' && slowState.icon === 'xlsx' && slowState.label === 'XLSX',
  `state=${slowState.state} detected=${slowState.kind} icon=${slowState.icon} label=${slowState.label}`,
)

// ...and it must give way to the real render once the bytes land.
await slowTile.locator('.dp-thumb__cell').first().waitFor({ timeout: 25000 })
const settled = await slowTile.evaluate((el) => ({
  state: el.dataset.state,
  placeholder: el.querySelector('.dp-thumb__glyph--loading') !== null,
}))
check(
  'placeholder yields to render',
  settled.state === 'ready' && !settled.placeholder,
  `state=${settled.state} placeholder still up=${settled.placeholder}`,
)

await page.unroute('**/fixtures/sample.xlsx')
await page.waitForTimeout(2000)

/*
 * Laziness, observed rather than assumed: the last row is below the grid's
 * scroll boundary, so it must still be an unloaded placeholder while the rows
 * above it have rendered. A tile that fetched here would have fetched on mount.
 */
const belowFold = page.locator('.demo__tile[data-label="Legacy .doc"] .dp-thumb')
const foldState = await belowFold.evaluate((el) => ({
  kind: el.dataset.kind,
  state: el.dataset.state,
  placeholder: el.querySelector('.dp-thumb__glyph--loading') !== null,
  offscreen: el.getBoundingClientRect().top > window.innerHeight,
}))
check(
  'thumb defers below fold',
  foldState.offscreen && foldState.kind === 'loading' && foldState.state === 'loading' && foldState.placeholder,
  `offscreen=${foldState.offscreen} kind=${foldState.kind} state=${foldState.state} placeholder=${foldState.placeholder}`,
)

for (const testCase of THUMB_CASES) {
  // Addressed by attribute: a tile's own rendered content can contain any
  // other tile's label (the markdown fixture mentions "PDF").
  const tile = page.locator(`.demo__tile[data-label="${testCase.label}"]`)
  const thumb = tile.locator(`.dp-thumb[data-kind="${testCase.kind}"]`)
  try {
    // Scroll it into view the way a reader would; a lazy tile only loads then.
    await tile.scrollIntoViewIfNeeded()
    await thumb.waitFor({ timeout: 25000 })
    await thumb.locator(testCase.ready).first().waitFor({ timeout: 25000 })
    console.log(`  PASS  ${('thumb ' + testCase.label).padEnd(21)} -> ${testCase.kind}`)
  } catch (err) {
    failures += 1
    const kind = await tile.locator('.dp-thumb').getAttribute('data-kind').catch(() => '?')
    console.log(`  FAIL  ${('thumb ' + testCase.label).padEnd(21)} -> got kind=${kind}: ${err.message.split('\n')[0]}`)
  }
}

// A tile must be filled by its content, not left as a partly-painted box.
const pdfTile = page.locator('.demo__tile[data-label="PDF"]')
await pdfTile.scrollIntoViewIfNeeded()
const coverGeometry = await pdfTile.locator('.dp-thumb').evaluate((el) => {
  const tile = el.getBoundingClientRect()
  const drawn = el.querySelector('.dp-thumb__canvas').getBoundingClientRect()
  return { tileW: Math.round(tile.width), drawnW: Math.round(drawn.width), drawnH: Math.round(drawn.height), tileH: Math.round(tile.height) }
})
check(
  'thumb cover fills tile',
  coverGeometry.drawnW >= coverGeometry.tileW - 1 && coverGeometry.drawnH >= coverGeometry.tileH - 1,
  `page ${coverGeometry.drawnW}x${coverGeometry.drawnH} in ${coverGeometry.tileW}x${coverGeometry.tileH} tile`,
)

// The whole page has to be inside the tile under contain, which is the mode's
// entire promise.
await page.getByRole('button', { name: 'contain', exact: true }).click()
await page.waitForTimeout(1200)
const containGeometry = await pdfTile.locator('.dp-thumb').evaluate((el) => {
  const tile = el.getBoundingClientRect()
  const drawn = el.querySelector('.dp-thumb__canvas').getBoundingClientRect()
  return { tileW: Math.round(tile.width), tileH: Math.round(tile.height), drawnW: Math.round(drawn.width), drawnH: Math.round(drawn.height) }
})
check(
  'thumb contain fits tile',
  containGeometry.drawnW <= containGeometry.tileW + 1 && containGeometry.drawnH <= containGeometry.tileH + 1,
  `page ${containGeometry.drawnW}x${containGeometry.drawnH} in ${containGeometry.tileW}x${containGeometry.tileH} tile`,
)

/*
 * The demo wraps each tile in a <button>, which the UA stylesheet centres. That
 * inherits, so without a reset every line of a text, JSON, XML or spreadsheet
 * tile renders centred — the tile must not take alignment from its wrapper.
 *
 * Checked at the tile root rather than on content: a cell may be centred by the
 * document itself, which is correct and must not be "fixed".
 */
const alignReset = await page.evaluate(() => {
  const wrapper = document.querySelector('.demo__tile[data-label="Plain text"]')
  const tile = wrapper?.querySelector('.dp-thumb')
  const pre = tile?.querySelector('.dp-thumb__pre')
  return {
    wrapper: wrapper ? getComputedStyle(wrapper).textAlign : 'missing',
    tile: tile ? getComputedStyle(tile).textAlign : 'missing',
    content: pre ? getComputedStyle(pre).textAlign : 'missing',
  }
})
check(
  'thumb ignores wrapper align',
  alignReset.wrapper === 'center' && alignReset.tile === 'start' && alignReset.content === 'start',
  `wrapper=${alignReset.wrapper} tile=${alignReset.tile} content=${alignReset.content}`,
)

/*
 * ExcelJS returns the same value for every cell of a merged range, so a title
 * merged across five columns renders five times over if the covered cells are
 * not dropped. The tile must agree with the reader on how many times it appears.
 */
const excelTile = page.locator('.demo__tile[data-label="Excel"]')
await excelTile.scrollIntoViewIfNeeded()
await excelTile.locator('.dp-thumb__cell').first().waitFor({ timeout: 25000 })
const titleRepeats = await excelTile.locator('.dp-thumb__cell').evaluateAll(
  (cells) => cells.filter((c) => c.innerText.includes('Regional performance')).length,
)
check('thumb merged cells once', titleRepeats === 1, `merged title drawn ${titleRepeats}x`)

/*
 * Icon mode draws the typed icon and nothing else — and, crucially, fetches
 * nothing. That is most of its value: a listing of a thousand files should cost
 * no bandwidth, so the request count is the real assertion here.
 */
await page.getByRole('button', { name: 'cover', exact: true }).click()
await page.waitForTimeout(500)

const fixtureRequests = []
const countFixtures = (request) => {
  if (request.url().includes('/fixtures/')) fixtureRequests.push(request.url())
}
page.on('request', countFixtures)

await page.getByRole('button', { name: 'icons only', exact: true }).click()
await page.waitForSelector('.dp-thumb[data-mode="icon"]')
// Scroll the whole grid past the viewport: a deferred fetch would fire here.
await page.locator('.demo__tile[data-label="Legacy .doc"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(2500)
page.off('request', countFixtures)

const iconTiles = await page.locator('.dp-thumb[data-mode="icon"]').evaluateAll((els) =>
  els.map((el) => ({
    kind: el.dataset.kind,
    state: el.dataset.state,
    icon: [...(el.querySelector('.dp-thumb__icon')?.classList ?? [])]
      .find((c) => c.startsWith('dp-thumb__icon--'))
      ?.replace('dp-thumb__icon--', ''),
    drew: el.querySelector('.dp-thumb__canvas, .dp-thumb__frame, .dp-thumb__image, .dp-thumb__grid, .dp-thumb__pre') !== null,
    pulsing: el.querySelector('.dp-thumb__glyph--loading') !== null,
  })),
)
check(
  'icon mode fetches nothing',
  fixtureRequests.length === 0,
  `${fixtureRequests.length} fixture request(s)${fixtureRequests.length ? ': ' + fixtureRequests[0] : ''}`,
)
check(
  'icon mode draws icons only',
  iconTiles.length === 20 &&
    iconTiles.every((t) => t.state === 'ready' && !t.drew && !t.pulsing && t.icon),
  `${iconTiles.length} tiles, ${iconTiles.filter((t) => t.drew).length} with rendered content`,
)
// The icon still has to be the right one, from the hint alone.
const iconByKind = Object.fromEntries(iconTiles.map((t) => [t.kind, t.icon]))
check(
  'icon mode types from the hint',
  iconByKind.xlsx === 'xlsx' &&
    iconByKind.pptx === 'pptx' &&
    iconByKind.unsupported === 'unsupported' &&
    iconByKind.html === 'html' &&
    iconByKind.video === 'video' &&
    iconByKind.audio === 'audio' &&
    iconByKind.csv === 'csv',
  Object.entries(iconByKind).map(([k, v]) => `${k}=${v}`).join(' '),
)

// ...and switching back must bring the real renders with it.
await page.getByRole('button', { name: 'rendered', exact: true }).click()
await page.locator('.demo__tile[data-label="Excel"]').scrollIntoViewIfNeeded()
await page.locator('.demo__tile[data-label="Excel"] .dp-thumb__cell').first().waitFor({ timeout: 25000 })
check('render mode restored', true, 'spreadsheet redrawn after toggling back')

// Tiles are decoration: the grid announces each file once, by name, and does
// not read out the body text of every document in it.
const tileAria = await page.locator('.dp-thumb').first().evaluate((el) => ({
  role: el.getAttribute('role'),
  label: el.getAttribute('aria-label'),
  hidden: el.querySelector('[aria-hidden="true"]') !== null,
}))
check(
  'thumb is labelled + inert',
  tileAria.role === 'img' && Boolean(tileAria.label) && tileAria.hidden,
  `role=${tileAria.role} label=${JSON.stringify(tileAria.label)} content hidden=${tileAria.hidden}`,
)

/* ------------------------------------------------------------- offline */

if (offline) {
  console.log(`\n  Off-origin requests attempted: ${offsite.length}`)
  for (const url of new Set(offsite)) console.log('    ' + url)
  if (offsite.length > 0) failures += 1
}

const realErrors = consoleErrors.filter((e) => !/favicon/i.test(e))
if (realErrors.length > 0) {
  console.log('\n  Console errors:')
  for (const err of new Set(realErrors)) console.log('    ' + err.slice(0, 160))
}

await browser.close()
stopPreview()
console.log(failures === 0 ? '\nAll browser checks passed.' : `\n${failures} browser check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
