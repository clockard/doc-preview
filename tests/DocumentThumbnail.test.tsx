import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DocumentThumbnail } from 'doc-preview'
import type { ThumbnailProps } from 'doc-preview'
import { fixture, jsonlessResponse, stubIntersectionObserver } from './helpers'

function mockFetch(body: ArrayBuffer, contentType: string, init?: { status?: number }) {
  const spy = vi.fn(async () => jsonlessResponse(body, { contentType, ...init }))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const markdownBody = () =>
  new TextEncoder().encode('# Quarterly report\n\nRevenue rose.').buffer as ArrayBuffer

/** Thumbnails size themselves from the box, so tests give one explicitly. */
const size = { width: 200, height: 260 }

describe('DocumentThumbnail', () => {
  it('does not fetch until the tile nears the viewport', async () => {
    const observer = stubIntersectionObserver()
    try {
      const spy = mockFetch(markdownBody(), 'text/markdown')
      render(<DocumentThumbnail url="/report.md" mimeType="text/markdown" {...size} />)

      // Off-screen: a grid of these must not open a connection each.
      expect(spy).not.toHaveBeenCalled()

      observer.trigger()
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    } finally {
      observer.restore()
    }
  })

  it('fetches immediately when lazy is off', async () => {
    const spy = mockFetch(markdownBody(), 'text/markdown')
    render(<DocumentThumbnail url="/report.md" mimeType="text/markdown" lazy={false} {...size} />)
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
  })

  it('renders the opening of a markdown document', async () => {
    mockFetch(markdownBody(), 'text/markdown')
    render(<DocumentThumbnail url="/report.md" mimeType="text/markdown" lazy={false} {...size} />)
    expect(await screen.findByText('Quarterly report')).toBeInTheDocument()
  })

  it('renders plain text without any of the reader chrome', async () => {
    mockFetch(new TextEncoder().encode('alpha\nbeta').buffer as ArrayBuffer, 'text/plain')
    render(<DocumentThumbnail url="/log.txt" mimeType="text/plain" lazy={false} {...size} />)
    expect(await screen.findByText(/alpha/)).toBeInTheDocument()
    // The reader shows a line count and a wrap toggle; a tile shows neither.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/lines/)).not.toBeInTheDocument()
  })

  it('highlights JSON the same way the reader does', async () => {
    const body = new TextEncoder().encode('{"name":"doc-preview"}').buffer as ArrayBuffer
    mockFetch(body, 'application/json')
    const { container } = render(
      <DocumentThumbnail url="/payload.json" mimeType="application/json" lazy={false} {...size} />,
    )
    await waitFor(() => expect(container.querySelector('.dp-tok--key')).toBeInTheDocument())
  })

  it('labels the tile for assistive tech and hides the document body from it', async () => {
    mockFetch(markdownBody(), 'text/markdown')
    render(<DocumentThumbnail url="/report.md" mimeType="text/markdown" lazy={false} {...size} />)

    const tile = await screen.findByRole('img', { name: 'report.md' })
    expect(tile).toBeInTheDocument()
    // Otherwise a grid would read out every file's prose in full.
    expect(tile.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('falls back to a named tile for a legacy .doc', async () => {
    mockFetch(await fixture('legacy.doc'), 'application/msword')
    render(<DocumentThumbnail url="/old.doc" mimeType="application/msword" lazy={false} {...size} />)
    expect(await screen.findByText('DOC')).toBeInTheDocument()
  })

  it('falls back to a named tile when the document cannot be fetched', async () => {
    mockFetch(new ArrayBuffer(0), 'text/plain', { status: 404 })
    const onError = vi.fn()
    render(
      <DocumentThumbnail url="/missing.pdf" mimeType="application/pdf" lazy={false} onError={onError} {...size} />,
    )
    expect(await screen.findByText('PDF')).toBeInTheDocument()
    await waitFor(() => expect(onError).toHaveBeenCalled())
  })

  it('detects a mislabelled docx from its bytes, as the reader does', async () => {
    mockFetch(await fixture('mislabelled.bin'), 'application/octet-stream')
    const onLoad = vi.fn()
    render(
      <DocumentThumbnail url="/blob/abc" mimeType="application/octet-stream" lazy={false} onLoad={onLoad} {...size} />,
    )
    await waitFor(() => expect(onLoad).toHaveBeenCalled())
    expect(onLoad.mock.calls[0][0].kind).toBe('docx')
  })

  it('lets a caller override a built-in thumbnail', async () => {
    mockFetch(markdownBody(), 'text/markdown')
    const Custom = ({ meta, fit }: ThumbnailProps) => <div>{meta.kind} as {fit}</div>
    render(
      <DocumentThumbnail
        url="/report.md"
        mimeType="text/markdown"
        lazy={false}
        thumbnails={{ markdown: Custom }}
        {...size}
      />,
    )
    expect(await screen.findByText('markdown as cover')).toBeInTheDocument()
  })

  it('passes the requested fit down to the thumbnail', async () => {
    mockFetch(markdownBody(), 'text/markdown')
    const Custom = ({ fit }: ThumbnailProps) => <div>fit is {fit}</div>
    render(
      <DocumentThumbnail
        url="/report.md"
        mimeType="text/markdown"
        lazy={false}
        fit="contain"
        thumbnails={{ markdown: Custom }}
        {...size}
      />,
    )
    expect(await screen.findByText('fit is contain')).toBeInTheDocument()
  })

  it('aborts the in-flight request when the URL changes', async () => {
    const abortSpy = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', abortSpy)
        return new Promise<Response>(() => {})
      }),
    )
    const { rerender } = render(
      <DocumentThumbnail url="/a.md" mimeType="text/markdown" lazy={false} {...size} />,
    )
    rerender(<DocumentThumbnail url="/b.md" mimeType="text/markdown" lazy={false} {...size} />)
    await waitFor(() => expect(abortSpy).toHaveBeenCalled())
  })
})

describe('DocumentThumbnail placeholder', () => {
  /** The icon's modifier class is how the tile says which format it thinks it has. */
  const iconKind = (container: HTMLElement) => {
    const icon = container.querySelector('.dp-thumb__icon')
    return [...(icon?.classList ?? [])]
      .find((c) => c.startsWith('dp-thumb__icon--'))
      ?.replace('dp-thumb__icon--', '')
  }

  it('shows a typed placeholder before any bytes arrive', () => {
    // Never resolves: the tile is stuck in exactly the state a slow download
    // leaves it in, which is the state this placeholder exists for.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = render(
      <DocumentThumbnail
        url="/reports/q3.xlsx"
        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        lazy={false}
        {...size}
      />,
    )
    expect(container.querySelector('.dp-thumb__glyph--loading')).toBeInTheDocument()
    expect(iconKind(container)).toBe('xlsx')
    expect(screen.getByText('XLSX')).toBeInTheDocument()
  })

  it('types the placeholder from the extension when the server sends no useful type', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = render(
      <DocumentThumbnail url="/files/deck.pptx" mimeType="application/octet-stream" lazy={false} {...size} />,
    )
    expect(iconKind(container)).toBe('pptx')
  })

  it('falls back to a neutral page when nothing identifies the file yet', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = render(
      <DocumentThumbnail url="/blob/abc" mimeType="application/octet-stream" lazy={false} {...size} />,
    )
    // Bytes will decide later; asserting a type here would be a guess, not a hint.
    expect(iconKind(container)).toBe('generic')
  })

  it('shows the placeholder before the tile is even in view', () => {
    const observer = stubIntersectionObserver()
    try {
      const spy = mockFetch(markdownBody(), 'text/markdown')
      const { container } = render(
        <DocumentThumbnail url="/notes.md" mimeType="text/markdown" {...size} />,
      )
      expect(spy).not.toHaveBeenCalled()
      expect(container.querySelector('.dp-thumb__glyph--loading')).toBeInTheDocument()
      expect(iconKind(container)).toBe('markdown')
    } finally {
      observer.restore()
    }
  })

  it('reports loading and ready through data-state', async () => {
    mockFetch(markdownBody(), 'text/markdown')
    const { container } = render(
      <DocumentThumbnail url="/notes.md" mimeType="text/markdown" lazy={false} {...size} />,
    )
    const tile = container.querySelector('.dp-thumb')!
    expect(tile.getAttribute('data-state')).toBe('loading')
    await waitFor(() => expect(tile.getAttribute('data-state')).toBe('ready'))
    expect(container.querySelector('.dp-thumb__glyph--loading')).not.toBeInTheDocument()
  })

  it('gives a failed fetch a typed, non-pulsing tile', async () => {
    mockFetch(new ArrayBuffer(0), 'application/pdf', { status: 500 })
    const { container } = render(
      <DocumentThumbnail url="/broken.pdf" mimeType="application/pdf" lazy={false} onError={vi.fn()} {...size} />,
    )
    await waitFor(() => expect(container.querySelector('.dp-thumb')?.getAttribute('data-state')).toBe('error'))
    expect(iconKind(container)).toBe('pdf')
    expect(container.querySelector('.dp-thumb__glyph--loading')).not.toBeInTheDocument()
  })

  it('gives an unsupported format its own icon, not the neutral page', async () => {
    mockFetch(await fixture('legacy.doc'), 'application/msword')
    const { container } = render(
      <DocumentThumbnail url="/old.doc" mimeType="application/msword" lazy={false} {...size} />,
    )
    await screen.findByText('DOC')
    expect(iconKind(container)).toBe('unsupported')
  })
})

describe('DocumentThumbnail icon mode', () => {
  const iconKind = (container: HTMLElement) =>
    [...(container.querySelector('.dp-thumb__icon')?.classList ?? [])]
      .find((c) => c.startsWith('dp-thumb__icon--'))
      ?.replace('dp-thumb__icon--', '')

  it('never fetches the document', async () => {
    const spy = mockFetch(markdownBody(), 'text/markdown')
    render(<DocumentThumbnail url="/report.md" mimeType="text/markdown" mode="icon" {...size} />)

    // Not merely deferred: an icon listing must cost no bandwidth at all, so
    // give any pending effect a chance to fire before asserting.
    await new Promise((done) => setTimeout(done, 20))
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not fetch even with lazy off', async () => {
    const spy = mockFetch(markdownBody(), 'text/markdown')
    render(
      <DocumentThumbnail url="/report.md" mimeType="text/markdown" mode="icon" lazy={false} {...size} />,
    )
    await new Promise((done) => setTimeout(done, 20))
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows the typed icon immediately, with no loading state', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = render(
      <DocumentThumbnail
        url="/reports/q3.xlsx"
        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        mode="icon"
        {...size}
      />,
    )
    const tile = container.querySelector('.dp-thumb')!
    expect(tile.getAttribute('data-state')).toBe('ready')
    expect(tile.getAttribute('data-mode')).toBe('icon')
    expect(tile.getAttribute('data-kind')).toBe('xlsx')
    expect(iconKind(container)).toBe('xlsx')
    expect(screen.getByText('XLSX')).toBeInTheDocument()
    // The pulse belongs to the placeholder; this tile is finished.
    expect(container.querySelector('.dp-thumb__glyph--loading')).not.toBeInTheDocument()
  })

  it('types the icon from the extension when the MIME hint is generic', () => {
    const { container } = render(
      <DocumentThumbnail url="/files/deck.pptx" mimeType="application/octet-stream" mode="icon" {...size} />,
    )
    expect(iconKind(container)).toBe('pptx')
  })

  it('reports an unknown kind rather than guessing when nothing identifies the file', () => {
    const { container } = render(
      <DocumentThumbnail url="/blob/abc" mimeType="application/octet-stream" mode="icon" {...size} />,
    )
    // Without the bytes there is nothing to detect from, and icon mode never
    // reads them — so the tile says so instead of inventing a format.
    expect(container.querySelector('.dp-thumb')?.getAttribute('data-kind')).toBe('unknown')
    expect(iconKind(container)).toBe('generic')
  })

  it('marks a legacy format unsupported without downloading it', () => {
    const spy = mockFetch(new ArrayBuffer(0), 'application/msword')
    const { container } = render(
      <DocumentThumbnail url="/old.doc" mimeType="application/msword" mode="icon" {...size} />,
    )
    expect(iconKind(container)).toBe('unsupported')
    expect(screen.getByText('DOC')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not fire onLoad, since no document is loaded', async () => {
    mockFetch(markdownBody(), 'text/markdown')
    const onLoad = vi.fn()
    render(
      <DocumentThumbnail url="/report.md" mimeType="text/markdown" mode="icon" onLoad={onLoad} {...size} />,
    )
    await new Promise((done) => setTimeout(done, 20))
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('labels the tile with the file name, not the whole URL', () => {
    mockFetch(new ArrayBuffer(0), 'application/pdf')
    render(
      <DocumentThumbnail url="/files/2024/q3-report.pdf" mimeType="application/pdf" mode="icon" {...size} />,
    )
    // No metadata ever arrives in icon mode, so the label has to come from the
    // URL itself — announcing a full path for every row of a listing is noise.
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'q3-report.pdf')
  })

  it('starts fetching when switched back to render mode', async () => {
    const spy = mockFetch(markdownBody(), 'text/markdown')
    const { rerender } = render(
      <DocumentThumbnail url="/report.md" mimeType="text/markdown" mode="icon" lazy={false} {...size} />,
    )
    expect(spy).not.toHaveBeenCalled()

    rerender(
      <DocumentThumbnail url="/report.md" mimeType="text/markdown" mode="render" lazy={false} {...size} />,
    )
    expect(await screen.findByText('Quarterly report')).toBeInTheDocument()
  })
})
