# offline-doc-preview

Two React components (a full-pane reader and a thumbnail tile) that render
PDF, Word, Excel, PowerPoint, images, HTML, video, audio, Markdown, JSON,
XML, CSV and plain text **entirely in the browser, with no external
services of any kind.** Nothing is uploaded, nothing is converted
server-side, and no Office Online / Google Docs viewer is embedded behind
the scenes. It works behind a firewall or on an air-gapped machine.

## Install

```bash
npm install offline-doc-preview
```

This package doesn't bundle its own copy of React so your app needs to already
have React 18 or 19 installed (`react` and `react-dom` are listed as `peerDependencies`,
so npm won't install them for you automatically).

The code for each format (PDF, Excel, etc.) is split into its own chunk and
only loaded from your app's own bundle the first time that format is
actually previewed. This is the same lazy-loading any code-split app already does,
not a network call anywhere else. If your app only ever previews Markdown
files, the PDF and spreadsheet chunks never get loaded at all.

## Usage

```tsx
import { DocumentPreview } from 'offline-doc-preview'
import 'offline-doc-preview/styles.css'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

<DocumentPreview
  url="/files/report.docx"
  mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  pdf={{ workerSrc }}
/>
```

For a file listing, `DocumentThumbnail` takes the same inputs and renders a
single representative frame for page 1, slide 1, or the top-left of the first
sheet:

```tsx
import { DocumentThumbnail } from 'offline-doc-preview'

<DocumentThumbnail url="/files/report.docx" fit="cover" pdf={{ workerSrc }} />
```

The PDF renderer needs a worker and won't guess where one lives, so pass
`pdf={{ workerSrc }}` as shown above (see the main repo README for CJK font
and search setup notes).

## Formats

| Format | Extensions |
| ------ | ---------- |
| PDF | `.pdf` |
| Word | `.docx` |
| Excel | `.xlsx` |
| PowerPoint | `.pptx` |
| Images | `.png` `.jpg` `.jpeg` `.jfif` `.gif` `.webp` `.avif` `.bmp` `.ico` `.svg` |
| TIFF | `.tif` `.tiff` (Safari only) |
| Markdown | `.md` `.markdown` `.mdown` `.mkd` |
| JSON | `.json` `.jsonc` `.jsonl` `.ndjson` |
| XML | `.xml` `.xsd` `.xsl` `.xslt` `.rss` `.atom` |
| HTML | `.html` `.htm` |
| Video | `.mp4` `.webm` `.mov` `.ogv` |
| Audio | `.mp3` `.wav` `.m4a` `.oga` `.ogg` |
| CSV / TSV | `.csv` `.tsv` |
| Text | `.txt` `.text` `.log` `.yaml` `.yml` |

Anything else, including legacy `.doc`, `.xls` and `.ppt`, renders a clear
"unsupported format" state with a download link rather than failing.

## Links

- [Full documentation, PDF setup, search, and theming](https://github.com/clockard/doc-preview#readme)
- [Issues](https://github.com/clockard/doc-preview/issues)

## License

MIT
