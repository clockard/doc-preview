# doc-preview

Two React components — a full-pane reader and a thumbnail tile — that render
PDF, Word, Excel, PowerPoint, images, HTML, video, audio, Markdown, JSON, XML,
CSV and plain text **entirely in the browser, with no external services of
any kind.**

Nothing is uploaded. Nothing is converted server-side. No CDN scripts, no remote
fonts, no Office Online or Google Docs viewer embedded behind the scenes. The
only network request the component makes is fetching the document you pointed it
at, from wherever you already serve it. Everything after that — parsing,
layout, rendering — happens locally, so it works on an air-gapped machine and
behind a firewall that blocks everything.

That is unusual enough to be worth stating plainly: several popular React
document viewers quietly iframe `view.officeapps.live.com` for Office formats,
which means the file leaves the building. This one has no such path, and there
are two checks in the build that fail if one ever appears.

```tsx
import { DocumentPreview } from 'doc-preview'
import 'doc-preview/styles.css'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

<DocumentPreview
  url="/files/report.docx"
  mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  pdf={{ workerSrc }}
/>
```

For a file listing, `DocumentThumbnail` takes the same inputs and renders a
single representative frame — page 1, slide 1, the top-left of the first sheet:

```tsx
import { DocumentThumbnail } from 'doc-preview'

<DocumentThumbnail url="/files/report.docx" fit="cover" pdf={{ workerSrc }} />
```

## What it supports

| Format | Extensions | Rendered by | Notes |
| ------ | ---------- | ----------- | ----- |
| PDF | `.pdf` | [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) | Lazy per-page canvas, selectable text layer, zoom, fit-to-width, whole-document search |
| Word | `.docx` | [`docx-preview`](https://github.com/VolodymyrBaydalka/docxjs) | Paginated, styled, headers and footers; rendered in an isolated iframe |
| Excel | `.xlsx` | [`exceljs`](https://github.com/exceljs/exceljs) + [`numfmt`](https://github.com/borgar/numfmt) | Sheet tabs, merged cells, frozen headers, real number formats, row virtualisation |
| PowerPoint | `.pptx` | [`pptxtojson`](https://github.com/pipipi-pikachu/pptxtojson) | Slide navigation, thumbnails, speaker notes; see the fidelity note below |
| Images | `.png` `.jpg` `.jpeg` `.jfif` `.gif` `.webp` `.avif` `.bmp` `.ico` `.svg` | the browser | Zoom, pan, fit / 1:1, transparency checkerboard |
| TIFF | `.tif` `.tiff` | the browser | Safari only — see below |
| Markdown | `.md` `.markdown` `.mdown` `.mkd` | [`react-markdown`](https://github.com/remarkjs/react-markdown) | GFM tables and task lists, sanitised |
| JSON | `.json` `.jsonc` `.jsonl` `.ndjson` | built in | Pretty-printed, highlighted, raw toggle |
| XML | `.xml` `.xsd` `.xsl` `.xslt` `.rss` `.atom` | built in | Pretty-printed, highlighted, raw toggle |
| HTML | `.html` `.htm` | [`DOMPurify`](https://github.com/cure53/DOMPurify) | Sanitised, rendered in an isolated iframe |
| Video | `.mp4` `.webm` `.mov` `.ogv` | the browser | Native controls; codec support varies — see below |
| Audio | `.mp3` `.wav` `.m4a` `.oga` `.ogg` | the browser | Native controls |
| CSV / TSV | `.csv` `.tsv` | built in | Rendered as a table, raw toggle |
| Text | `.txt` `.text` `.log` `.yaml` `.yml` | built in | Encoding detection, wrap toggle |

Anything else — including legacy `.doc`, `.xls` and `.ppt` — renders a clear
"unsupported format" state with a download link rather than failing.

## Installation

```bash
npm install doc-preview
```

React 18 or 19 is a peer dependency. The format libraries are regular
dependencies, each **loaded on demand**: previewing a Markdown file never
downloads the PDF engine or the spreadsheet parser.

## PDF setup

The PDF renderer needs a worker, and it will not guess where one lives — the
consuming app's bundler is the only thing that knows. Without it you get an
explicit error telling you what to pass, rather than a silent fallback.

```tsx
// Vite
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

<DocumentPreview url={url} mimeType={mimeType} pdf={{ workerSrc }} />
```

For **CJK text and PDFs that do not embed their fonts**, also serve PDF.js's
`cmaps` and `standard_fonts` from your own origin:

```bash
cp -r node_modules/pdfjs-dist/cmaps public/pdfjs/cmaps
cp -r node_modules/pdfjs-dist/standard_fonts public/pdfjs/standard_fonts
```

```tsx
pdf={{ workerSrc, cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/' }}
```

Both are optional. Omitted, PDF.js skips those resources — it does **not** fall
back to a remote host — so text renders with substituted fonts instead.

## PDF search

PDF is the one format where the browser's native Ctrl+F does not reliably
work, and that is what this exists to fix. Pages render lazily as they near
the viewport — the difference between a snappy reader and a multi-second
freeze on a long document — so only the pages currently near the viewport
have a text layer mounted at any moment. Ctrl+F can only find text that is
actually in the DOM; a match forty pages away is invisible to it until you
scroll there yourself.

Click the search icon in the PDF toolbar (or the results are equivalent
either way): the whole document's text is extracted once, on the first
search, and cached — cheap enough to do for the full document at once, with
no reason to pay that cost for a document nobody searches. Results are
reported per page, with **Enter**/**Shift+Enter** or the ‹ › buttons
stepping between pages that contain a match; each jump scrolls straight to
that page, whether or not it had rendered yet, and highlights the match once
it has.

The highlight is painted as an overlay, not by wrapping the match in markup:
the text layer that makes selection and copy work is invisible by design
(`opacity: 0.2`, dimming the browser's own selection colour), and a
highlight painted as its descendant — by any method, including the CSS
Custom Highlight API — would inherit that same dimming with no way for a
child to opt back out of an ancestor's `opacity`. Rendering it as a sibling,
positioned from the same text geometry, keeps it at full strength.

Matching is per text run: PDF.js emits one text node per run of text sharing
a style, so a query spanning two adjacent runs (a word split across a font
change, mid-way through) will not be found. This covers the ordinary case —
a whole word or phrase within one run — without reimplementing the text
layer's own internal fragmentation.

## Props

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `url` | `string` | Where to fetch the document from. Required. |
| `mimeType` | `string` | Type hint. Detection falls back to extension and magic bytes when it is wrong or generic. |
| `fileName` | `string` | Improves extension detection and names the download. Inferred from `url` otherwise. |
| `fetchOptions` | `RequestInit` | Passed to `fetch` — credentials, auth headers, cache mode. |
| `maxBytes` | `number` | Refuse documents larger than this. Default 100 MB. |
| `className` | `string` | Added to the root element. |
| `onLoad` | `(meta: DocumentMeta) => void` | Fires with the detected kind, effective MIME type and size. |
| `onError` | `(err: Error) => void` | Fetch, parse and render failures. |
| `renderers` | `Partial<Record<DocKind, RendererComponent>>` | Override or extend the built-in renderers. |
| `pdf` | `PdfAssetOptions` | `workerSrc`, `cMapUrl`, `standardFontDataUrl`. |

The component fills its container, so give that container a height.

Also exported: `resolveKind`, `guessKind`, `extensionOf`, `fileNameOf`,
`mimeForKind`, `useDocumentSource`, `RENDERERS`, `THUMBNAILS`, and
`DocumentPreviewError` (whose `code` is one of `fetch`, `http`, `too-large`,
`parse`, `aborted`). `guessKind` is the synchronous half of `resolveKind` —
MIME hint and file name only, no bytes — returning `null` when only the bytes
can decide.

### Custom renderers

Every renderer receives `{ data: ArrayBuffer, meta, pdf, onError }` and returns
JSX, so replacing one — or adding a format — needs nothing else:

```tsx
<DocumentPreview
  url={url}
  renderers={{ xlsx: MyGrid, text: MyTextViewer }}
/>
```

The keys are `DocKind` values: `pdf`, `docx`, `xlsx`, `pptx`, `markdown`, `json`,
`xml`, `csv`, `image`, `html`, `video`, `audio`, `text` — and `unsupported`,
which replaces the built-in "unsupported format" state for files nothing can
render. `thumbnails` on
`DocumentThumbnail` works the same way.

## Thumbnails

`DocumentThumbnail` renders one representative frame of a document at tile size.
It shares the whole fetch-and-identify layer with `DocumentPreview`, so detection,
offline behaviour and the `pdf` asset wiring are identical.

```tsx
<DocumentThumbnail url="/files/deck.pptx" width={200} height={260} fit="cover" />
```

| Kind | What the tile shows |
| ---- | ------------------- |
| PDF | Page 1, drawn to a canvas at tile resolution (no text layer) |
| Word | Page 1; later pages hidden, the page scaled down |
| Excel | The top-left block of the first visible sheet, with its real formats and fills |
| PowerPoint | Slide 1, through the same slide renderer the reader uses |
| Images | The image, framed with `object-fit` |
| HTML | The document, in the same sandboxed iframe the reader uses, scaled down |
| Video | The first frame, captured to a canvas — the same "real page 1" treatment as PDF and PPTX |
| Audio | The typed icon; audio has no visual frame to show |
| Markdown | The opening of the document, rendered and sanitised |
| JSON / XML | The opening, pretty-printed and highlighted |
| CSV / TSV | The first lines, in the tile's monospace page — same treatment as Text |
| Text | The first lines, in the tile's monospace page |

Spreadsheets fit their **width** rather than filling the tile: a sheet has no
page for `cover` to cover, and scaling a short one to fill would zoom into two
columns instead of previewing it.

### Placeholders and fallbacks

Every tile shows a typed icon from its very first frame — a distinct pictograph
and accent per format, with the extension spelled out beneath. There is no
anonymous grey box at any point:

- **While loading**, the icon is dimmed and pulsing. It comes from `guessKind`,
  which reads the MIME hint and file name **synchronously**, so a slow download
  shows a spreadsheet tile immediately rather than becoming one several seconds
  later. When neither the hint nor the name identifies the file, a neutral page
  is shown — the bytes decide, and asserting a format there would be a guess
  rather than a hint.
- **While parsing**, the same placeholder stays up. Opening a large `.docx` or
  `.pptx` is not instant, and the tile does not flash an empty frame in between.
- **Permanently**, for a legacy `.doc`, an unknown format, a TIFF outside
  Safari, or a document whose parse fails — at full opacity, naming the format.

`data-state` on the root is `loading`, `ready` or `error`; `data-mode` is
`render` or `icon`; `data-fit` is the framing in force. In render mode
`data-kind` carries the **detected** kind only and stays `loading` until the
bytes confirm it — the guess drives the icon,
never that attribute. In icon mode there is nothing to detect from, so it
carries the guessed kind, or `unknown`.

### Icon-only mode

```tsx
<DocumentThumbnail url="/files/report.docx" mode="icon" />
```

`mode="icon"` draws the typed file icon and **makes no network request at all**.
That is the point of it: a listing of a thousand attachments costs no bandwidth,
does no parsing, and paints on the first frame. Use it for long lists, for the
rows of a table, or wherever a preview is not worth a download.

The tradeoff is detection. With nothing fetched, the kind comes from
`guessKind` — the MIME hint and file name only — so a file served as
`application/octet-stream` from a URL with no extension shows a neutral page
icon instead of its real type. In `render` mode the same file is identified from
its magic bytes. If you need that certainty, you need the bytes.

Because nothing is loaded, `onLoad` never fires in icon mode, and `lazy` has
nothing to defer. `data-kind` carries the guessed kind, or `unknown`.

### Thumbnail props

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `url` | `string` | Where to fetch the document from. Required. |
| `mimeType` `fileName` `fetchOptions` | | As on `DocumentPreview`. |
| `maxBytes` | `number` | Default **25 MB** — lower than the reader's 100 MB, since a tile is not worth a large download. |
| `width` `height` | `number` | Tile size. Optional: the component measures itself, so sizing `.dp-thumb` in CSS works too. Defaults to 200 × 260. |
| `fit` | `'cover' \| 'contain'` | `cover` (default) crops to fill for a uniform grid; `contain` letterboxes the whole page. Ignored when `mode` is `icon`. |
| `mode` | `'render' \| 'icon'` | `render` (default) previews the document. `icon` shows only the typed file icon and **fetches nothing** — see below. |
| `lazy` | `boolean` | Default `true`. Defers fetching until the tile nears the viewport. |
| `rootMargin` | `string` | How far ahead of the viewport `lazy` starts loading. Default `'300px'`. |
| `onLoad` `onError` | | As on `DocumentPreview`. |
| `thumbnails` | `Partial<Record<DocKind, ThumbnailComponent>>` | Override or extend the built-in tiles. |
| `pdf` | `PdfAssetOptions` | Required for PDF tiles, same as the reader. |

Thumbnail renderers receive `{ data, meta, box, fit, pdf, onError }`, where `box`
is the measured tile in CSS pixels.

**Tiles are deliberately inert.** No toolbars, no pointer or keyboard handlers,
nothing bound to `window`, and `pointer-events: none` on the content. This is not
just tidiness: the full `PptxRenderer` and `ImageRenderer` each bind a global
keydown listener, so twenty readers shrunk into a grid would install twenty
handlers all reacting to the same arrow-key press. Wrap the tile in your own
button or link to make it clickable.

Each tile is `role="img"` with an `aria-label` of the file name, and its rendered
content is `aria-hidden`, so a grid reads as a list of documents instead of
reciting the body text of every file in it.

**`lazy` and scroll containers.** `rootMargin` expands the observer's root — the
viewport — but not any intermediate `overflow: auto` ancestor. If your grid
scrolls inside its own container, tiles load as they enter that container rather
than `rootMargin` ahead of it. That is the browser's behaviour, not a setting.

## Theming

Both roots — `.dp-root` and `.dp-thumb` — declare the same CSS custom properties,
so one rule restyles the reader and every tile:

```css
.dp-root, .dp-thumb {
  --dp-bg: #101418;
  --dp-surface: #171b21;
  --dp-text: #e8eaed;
  --dp-accent: #7aa2f7;
}
```

Surfaces are `--dp-bg`, `--dp-surface`, `--dp-border`, `--dp-text`, `--dp-muted`,
`--dp-accent`, `--dp-toolbar` and `--dp-warn`; syntax colours are `--dp-syn-*`;
the thumbnail icons take a per-format accent from `--dp-icon-*` (`--dp-icon-pdf`,
`--dp-icon-xlsx`, and so on).

A dark palette is applied automatically under `prefers-color-scheme: dark`, and
the loading tile's pulse is stilled under `prefers-reduced-motion: reduce`. No
webfonts are loaded for any of this — the offline guarantee below covers the
stylesheet too.

## Format detection

`mimeType` is a hint, not the last word — servers routinely hand back Office
files as `application/octet-stream`. Detection runs in three stages, first
confident answer winning:

1. **MIME type**, when it is informative. `image/*` is taken as a family, and
   RFC 6839 structured suffixes are understood, so `application/vnd.api+json`
   and `application/rss+xml` resolve to JSON and XML.
2. **File extension**, from `fileName` or the URL path.
3. **Magic bytes** — `%PDF`, the OLE2 signature for legacy Office files, image
   signatures (PNG, JPEG, GIF, BMP, WebP's RIFF container, AVIF/HEIC's `ftyp`
   brand, TIFF in both byte orders), and for zip containers a look inside for
   `word/document.xml`, `xl/workbook.xml` or `ppt/presentation.xml`.

Anything still unidentified that looks like text is checked for JSON and XML
before falling back to plain text, so an API payload from a blob endpoint is
pretty-printed rather than dumped into a `<pre>`.

`onLoad` reports the *effective* type it settled on, which may differ from what
you passed in.

Two ordering details that matter: image signatures are checked **before** the
plain-text heuristic, because BMP's `BM` marker and big-endian TIFF's `MM`
marker are both printable ASCII; and an SVG is recognised as an image rather
than as XML, because someone opening one wants the picture.

## Images

Decoding is the browser's job, so anything it displays works. There is no format
whitelist — one would reject formats browsers gained support for after this was
written — so a file the browser cannot decode reports that through the image's
own error event and offers a download instead.

| Control | |
| --- | --- |
| Zoom | `+` / `−` buttons, or **ctrl/⌘ + wheel** |
| Fit / actual size | **Fit** and **1:1** buttons, or double-click to toggle |
| Pan | drag the image, or use the scrollbars |
| Keyboard | `+` `−` zoom, `0` fit, `1` actual size |

A plain wheel scrolls rather than zooming. Zooming on an unmodified wheel would
trap the page's scroll whenever the pointer crossed an embedded preview, and
this component does not own the page it sits in.

Two deliberate behaviours: **Fit never scales up**, so a 32px icon renders at
32px instead of being blown across the pane; and magnified images use
`image-rendering: pixelated`, so inspecting at 1:1 or beyond shows real pixels
rather than interpolation. Transparency is drawn over a checkerboard.

### TIFF

**TIFF renders in Safari and nowhere else.** Safari decodes it through macOS
system codecs; Chrome and Firefox never have, and nothing client-side changes
that short of bundling a decoder.

It is still detected — by extension and by both byte orders' signatures,
including BigTIFF — so that it fails *informatively*: browsers that cannot
decode it show "This browser cannot display image/tiff" with a download link,
instead of the vague unsupported state these files landed in whenever the server
did not label the type.

Making TIFF display everywhere would need a JS/WASM decoder (`utif` is MIT and
around 30 kB) drawing to a canvas. That is a deliberate omission, not an
oversight — multi-page TIFFs would also want page navigation of their own.

## HTML

Rendered inside a same-origin sandboxed iframe (`sandbox="allow-same-origin"`,
deliberately no `allow-scripts`) — the same containment DOCX already uses, and
for the same two reasons: nothing in an HTML file should ever execute, and a
document's own stylesheet must not leak into your app. The markup is passed
through DOMPurify before it ever reaches the iframe, so the sandbox is defence
in depth rather than the only safeguard. See [Security](#security).

## Video and audio

Decoded and played by the browser, the same "no whitelist" philosophy as
images: whatever codecs the browser has, it plays, and a file it cannot decode
reports that through the element's own error event with a download link — the
same fallback TIFF gets.

**Container support is broad, codec support is not.** MP4/WebM containers
open everywhere; whether a given file *plays* depends on the codec inside it
(H.264 and VP8/VP9 are close to universal, AV1 and some HEVC variants are not).
MOV in particular tends to fail outside Safari, the same story as TIFF. There
is no way to know this in advance from the container alone — the player
reports it once it actually tries to decode the stream.

A file that never resolves to a definite decoded/failed state within a few
seconds (some browsers do not reliably fire the `error` event for a badly
malformed file) is treated as failed anyway, so a broken video cannot leave
the tile or the reader spinning forever.

## JSON and XML

Both are pretty-printed and syntax-highlighted, with a **Raw** toggle for the
original bytes and a wrap toggle for long lines.

- **JSON** is re-serialised with two-space indentation. Newline-delimited JSON
  (one object per line, as log pipelines emit) is detected and formatted
  per-record rather than rejected.
- **XML** is formatted with the browser's own parser, so entities and CDATA come
  through byte-for-byte. Elements containing text are left on one line:
  indenting them would rewrite whitespace that is significant in mixed content
  like `<p>text <b>bold</b> more</p>`.
- **Malformed input is not swallowed.** The original text is shown with the
  parser's complaint, and the view starts on Raw — a broken document is exactly
  when you need the actual bytes.
- Highlighting is skipped above 2 MB, where the element count costs more than
  the colour is worth.

## CSV and TSV

Rendered as an actual `<table>` — a header row plus the data — with a **Raw**
toggle for the original text and a wrap toggle in that view. The delimiter is
detected automatically: more tabs than commas on the first line means TSV.

Quoting follows RFC 4180: a quoted field may contain the delimiter, a newline,
or `""` as an escaped quote, all of which round-trip correctly rather than
splitting the row apart.

**Malformed input is not swallowed**, the same principle as XML: a file whose
row lengths disagree is not something a grid can represent faithfully, so the
view starts on Raw with a note explaining why, rather than silently drawing a
misleading table.

CSV has no reliable magic-byte signature — unlike JSON, there is nothing to
confirm a run of comma-separated text actually *is* CSV rather than prose that
happens to contain commas. So detection here stops at the MIME type and file
extension; an unlabelled CSV with a generic type and no extension falls back
to plain text, the same conservative call the rest of the detection chain
makes wherever only a guess is possible.

## PowerPoint fidelity

PPTX is the one format where pure-browser rendering is genuinely approximate.
`pptxtojson` reports roughly 80% layout fidelity overall, and ~95% for decks
authored normally by hand. Expect degradation on complex commercial templates,
deeply nested groups, and unusual shape geometry. Charts, video and audio render
as labelled placeholders — a read-only preview should not have to bundle a
charting engine. Slide transitions and animations are not rendered.

Two things the renderer does to keep decks legible:

- **Units are normalised.** The parser reports geometry in points but leaves
  font sizes in `pt`, which browsers render at 1.333×. Left alone, text
  overflows the box it was measured into and titles clip to their first word.
- **Text shrinks to fit its shape**, like PowerPoint's "shrink text on
  overflow". The fonts a deck names — Calibri, Aptos — are almost never
  installed on the viewing machine, so the browser substitutes different metrics
  and text that fit in PowerPoint no longer does. Shrinking absorbs that instead
  of wrapping into a neighbouring element.

An alternative worth knowing about: a real OOXML layout engine compiled to WASM
([OfficeCLI](https://github.com/iOfficeAI/OfficeCLI), via
`@simple-office-previewer`) renders Office formats with higher fidelity and even
evaluates formulas. It was trialled here and removed — it costs ~4.9 MB brotli
on first use, takes seconds on spreadsheets, and ships its own viewer chrome
that does not match the rest of the component. The DOM renderers are faster and
visually consistent. If you need maximum fidelity over those things, it drops in
through the `renderers` prop.

## Excel notes

Formula cells display the **cached result** stored in the file, which is what
Excel itself shows before it recalculates. Nothing here evaluates formulas, so a
file whose cached values disagree with its formulas — one edited by a tool that
shifted rows without adjusting ranges, say — displays the stale value.

Number formats *are* applied. ExcelJS reports a cell's format string but never
applies it, so without `numfmt` dates surface as raw serials and currency as
unrounded floats. Dates are converted using UTC components: spreadsheet dates
carry no timezone and ExcelJS materialises them at UTC midnight, so reading
local components renders every date a day early for anyone west of UTC.

## Offline guarantee

Nothing reaches the network except the `fetch` of the document you asked for.
That is enforced, not asserted:

- `npm run check:offline` fails the build on any remote URL, `@import`, or CDN
  reference in the library source.
- `npm run smoke:offline` loads every format in a real browser with **all
  off-origin requests blocked**, and fails if any is attempted.

Both run clean, with zero off-origin requests across every supported format.

The things that would break this if left unguarded, and how each is handled: the
PDF.js worker and font assets are supplied by you and resolved locally; no
webfonts are used anywhere, only system font stacks; and no format is delegated
to a hosted converter or viewer.

## Security

Documents are untrusted input. Four formats can carry markup, and all four are
treated accordingly:

- **DOCX** renders inside a same-origin iframe with `sandbox="allow-same-origin"`
  — deliberately no `allow-scripts`. This also stops docx-preview's broad
  injected CSS from leaking into your app. The output is passed through DOMPurify
  as well.
- **PPTX** text, table cells and speaker notes arrive as HTML from the parser and
  are sanitised with DOMPurify before rendering.
- **Markdown** goes through `rehype-sanitize`.
- **HTML** is sanitised with DOMPurify before it ever reaches the same kind of
  sandboxed, script-disabled iframe DOCX uses.

JSON and XML highlighting emits React elements, never HTML strings, so their
content reaches the DOM only as text children and can never be interpreted as
markup. SVG is rendered through an `<img>`, where scripts inside the file do not
execute.

A size guard (`maxBytes`, default 100 MB) trips partway through an oversized
download rather than after it has all been buffered.

## Development

Requires **Node 22+** — `pdfjs-dist` 6, Vite 8 and Vitest 5 all need it.
`.nvmrc` pins it.

```bash
nvm use            # Node 22
npm install
npm run fixtures   # generate sample documents + copy PDF.js assets
npm run dev        # demo app at http://localhost:5173
```

| Command | What it does |
| ------- | ------------ |
| `npm run verify` | Offline check, typecheck, unit tests, library build |
| `npm test` | Vitest — detection, formatting, component states, real-parser fixtures |
| `npm run smoke` | Builds the demo and drives every format in headless Chromium |
| `npm run smoke:offline` | The same, with all off-origin requests blocked |
| `npm run fixtures` | Regenerate the sample documents |
| `npm run build` | Build the publishable library |

Currently 255 unit tests and 88 browser checks.

Fixtures are **generated rather than committed as binaries**, so they stay
reviewable in a diff — see `scripts/`, which builds the DOCX, XLSX and PPTX
packages by hand along with a PDF, a PNG (`png.mjs`), a TIFF (`tiff.mjs`) and a
WAV (`wav.mjs`). The video fixture is deliberately just a WebM signature with
no decodable stream behind it — hand-rolling a real encoded frame is a
different order of work, so it exercises the "cannot play" path instead, the
same strategy the TIFF fixture already uses. `npm run smoke` starts and stops
its own preview server.

### Layout

```
packages/doc-preview/src/
├── DocumentPreview.tsx    # source → kind → renderer + chrome
├── DocumentThumbnail.tsx  # source → kind → tile, with a lazy-load gate
├── resolveKind.ts         # mime + extension + magic-byte detection
├── useDocumentSource.ts   # fetch → ArrayBuffer, abort, progress, size guard
├── registry.ts            # DocKind → lazily imported renderer
├── thumbRegistry.ts       # DocKind → lazily imported thumbnail
├── renderers/             # one per format family
├── thumbnails/            # tile per format family, the icon set, the geometry
├── format/                # JSON/XML/CSV formatters and tokenisers
└── chrome/                # toolbar, spinner, error and unsupported states
```

The two components share everything below the renderer: fetching, detection,
error boundaries, and per-format helpers such as the slide renderer, the cell
formatter and the syntax tokeniser. What differs is only the presentation.

## Limitations

- Legacy `.doc`, `.xls` and `.ppt` are unsupported by design; no viable
  pure-browser renderer exists for them.
- Password-protected documents cannot be opened.
- TIFF displays in Safari only; elsewhere it reports that it cannot be shown.
- Video and audio playback depends on the browser's own codec support — see
  [Video and audio](#video-and-audio) — and MOV in particular tends to fail
  outside Safari.
- PPTX charts, video and audio are placeholders; animations and transitions are
  not rendered.
- Excel formulas show their cached result; nothing is recalculated.
- PDF search matches within a single text run, not across two adjacent runs
  a query happens to straddle — see [PDF search](#pdf-search).
- Read-only: no editing, annotation or form filling.
- Word and PowerPoint thumbnails parse the **whole** file to show one page —
  neither `docx-preview` nor `pptxtojson` exposes a partial mode. The lower
  default `maxBytes` on thumbnails is the mitigation.
- Thumbnails are live DOM, not bitmaps, so they cannot be persisted, exported or
  uploaded. Nothing is cached between mounts either; lazy loading is what keeps
  a long grid cheap.
