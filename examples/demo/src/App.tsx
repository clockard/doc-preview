import { useState } from 'react'
import { DocumentPreview, DocumentThumbnail } from 'doc-preview'
import type { DocumentMeta, ThumbFit, ThumbMode } from 'doc-preview'
import { PDF_ASSETS } from './pdfAssets'

interface Sample {
  label: string
  url: string
  /** Deliberately omitted or wrong on some samples to exercise detection. */
  mimeType?: string
}

const SAMPLES: Sample[] = [
  { label: 'PDF', url: '/fixtures/sample.pdf', mimeType: 'application/pdf' },
  {
    label: 'Word',
    url: '/fixtures/sample.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    label: 'Excel',
    url: '/fixtures/sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    label: 'PowerPoint',
    url: '/fixtures/sample.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  { label: 'Markdown', url: '/fixtures/sample.md', mimeType: 'text/markdown' },
  { label: 'PNG', url: '/fixtures/sample.png', mimeType: 'image/png' },
  { label: 'SVG', url: '/fixtures/sample.svg', mimeType: 'image/svg+xml' },
  { label: 'Small icon', url: '/fixtures/icon.png', mimeType: 'image/png' },
  // Only Safari decodes TIFF; elsewhere this shows the undecodable-image state.
  { label: 'TIFF', url: '/fixtures/sample.tiff', mimeType: 'image/tiff' },
  { label: 'JSON', url: '/fixtures/sample.json', mimeType: 'application/json' },
  { label: 'XML', url: '/fixtures/sample.xml', mimeType: 'application/xml' },
  { label: 'HTML', url: '/fixtures/sample.html', mimeType: 'text/html' },
  { label: 'Audio', url: '/fixtures/sample.wav', mimeType: 'audio/wav' },
  // Real container signature, undecodable stream — same strategy as the TIFF
  // fixture, exercising the "cannot play" path rather than real playback.
  { label: 'Video', url: '/fixtures/sample.webm', mimeType: 'video/webm' },
  { label: 'CSV', url: '/fixtures/sample.csv', mimeType: 'text/csv' },
  { label: 'Plain text', url: '/fixtures/sample.txt', mimeType: 'text/plain' },
  // Detection cases: the server-side type is useless, so bytes must decide.
  { label: 'Mislabelled .docx', url: '/fixtures/mislabelled.bin', mimeType: 'application/octet-stream' },
  { label: 'Sniffed JSON', url: '/fixtures/payload.bin', mimeType: 'application/octet-stream' },
  { label: 'Sniffed PNG', url: '/fixtures/picture.bin', mimeType: 'application/octet-stream' },
  { label: 'Legacy .doc', url: '/fixtures/legacy.doc', mimeType: 'application/msword' },
]

export function App() {
  const [active, setActive] = useState(SAMPLES[0])
  const [meta, setMeta] = useState<DocumentMeta | null>(null)
  const [custom, setCustom] = useState('')
  const [view, setView] = useState<'preview' | 'thumbnails'>('preview')
  const [fit, setFit] = useState<ThumbFit>('cover')
  const [thumbMode, setThumbMode] = useState<ThumbMode>('render')

  if (view === 'thumbnails') {
    return (
      <div className="demo">
        <header className="demo__bar">
          <strong className="demo__title">doc-preview</strong>
          <nav className="demo__samples">
            <button type="button" className="demo__chip" onClick={() => setView('preview')}>
              ← Back to preview
            </button>
            <button
              type="button"
              className={thumbMode === 'render' ? 'demo__chip demo__chip--active' : 'demo__chip'}
              onClick={() => setThumbMode('render')}
            >
              rendered
            </button>
            <button
              type="button"
              className={thumbMode === 'icon' ? 'demo__chip demo__chip--active' : 'demo__chip'}
              onClick={() => setThumbMode('icon')}
            >
              icons only
            </button>
            {/* Framing is meaningless when there is no document being drawn. */}
            {thumbMode === 'render' && (
              <>
                <span className="demo__divider" aria-hidden="true" />
                <button
                  type="button"
                  className={fit === 'cover' ? 'demo__chip demo__chip--active' : 'demo__chip'}
                  onClick={() => setFit('cover')}
                >
                  cover
                </button>
                <button
                  type="button"
                  className={fit === 'contain' ? 'demo__chip demo__chip--active' : 'demo__chip'}
                  onClick={() => setFit('contain')}
                >
                  contain
                </button>
              </>
            )}
          </nav>
        </header>

        <main className="demo__grid" data-testid="thumbnail-grid">
          {SAMPLES.map((sample) => (
            <button
              key={sample.url}
              type="button"
              className="demo__tile"
              data-label={sample.label}
              onClick={() => {
                setMeta(null)
                setActive(sample)
                setView('preview')
              }}
            >
              <DocumentThumbnail
                url={sample.url}
                mimeType={sample.mimeType}
                fit={fit}
                mode={thumbMode}
                pdf={PDF_ASSETS}
              />
              <span className="demo__tile-label">{sample.label}</span>
            </button>
          ))}
        </main>
      </div>
    )
  }

  return (
    <div className="demo">
      <header className="demo__bar">
        <strong className="demo__title">doc-preview</strong>
        <nav className="demo__samples">
          <button type="button" className="demo__chip" onClick={() => setView('thumbnails')}>
            Thumbnails →
          </button>
          {SAMPLES.map((sample) => (
            <button
              key={sample.url}
              type="button"
              className={sample.url === active.url ? 'demo__chip demo__chip--active' : 'demo__chip'}
              onClick={() => {
                setMeta(null)
                setActive(sample)
              }}
            >
              {sample.label}
            </button>
          ))}
        </nav>
        <form
          className="demo__url"
          onSubmit={(event) => {
            event.preventDefault()
            if (custom.trim()) {
              setMeta(null)
              setActive({ label: 'Custom', url: custom.trim() })
            }
          }}
        >
          <input
            type="text"
            value={custom}
            placeholder="…or paste a URL"
            onChange={(event) => setCustom(event.target.value)}
          />
          <button type="submit">Open</button>
        </form>
      </header>

      {meta && (
        <div className="demo__meta">
          detected <code>{meta.kind}</code> · {meta.mimeType} · {meta.byteLength.toLocaleString()} bytes
        </div>
      )}

      <main className="demo__stage">
        <DocumentPreview
          key={active.url}
          url={active.url}
          mimeType={active.mimeType}
          pdf={PDF_ASSETS}
          onLoad={setMeta}
        />
      </main>
    </div>
  )
}
