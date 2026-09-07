import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DocumentPreview } from 'doc-preview'
import type { RendererProps } from 'doc-preview'
import { fixture, jsonlessResponse } from './helpers'

function mockFetch(body: ArrayBuffer, contentType: string, init?: { status?: number }) {
  const spy = vi.fn(async () => jsonlessResponse(body, { contentType, ...init }))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const textBody = () => new TextEncoder().encode('# Heading\n\nBody text.').buffer as ArrayBuffer

describe('DocumentPreview', () => {
  it('shows a loading state before the document arrives', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    render(<DocumentPreview url="/slow.md" mimeType="text/markdown" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders markdown and reports the detected kind', async () => {
    mockFetch(textBody(), 'text/markdown')
    const onLoad = vi.fn()
    render(<DocumentPreview url="/notes.md" mimeType="text/markdown" onLoad={onLoad} />)

    expect(await screen.findByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    await waitFor(() => expect(onLoad).toHaveBeenCalled())
    expect(onLoad.mock.calls[0][0]).toMatchObject({ kind: 'markdown', fileName: 'notes.md' })
  })

  it('renders plain text', async () => {
    mockFetch(new TextEncoder().encode('line one\nline two').buffer as ArrayBuffer, 'text/plain')
    render(<DocumentPreview url="/log.txt" mimeType="text/plain" />)
    expect(await screen.findByText(/line one/)).toBeInTheDocument()
    expect(screen.getByText('2 lines')).toBeInTheDocument()
  })

  it('renders CSV as a table', async () => {
    mockFetch(new TextEncoder().encode('name,total\nAlice,12\nBob,7').buffer as ArrayBuffer, 'text/csv')
    render(<DocumentPreview url="/report.csv" mimeType="text/csv" />)
    expect(await screen.findByRole('columnheader', { name: 'total' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Alice' })).toBeInTheDocument()
    expect(screen.getByText('3 rows · 2 columns')).toBeInTheDocument()
  })

  it('falls back to raw text for a ragged CSV rather than a misleading table', async () => {
    mockFetch(new TextEncoder().encode('a,b,c\n1,2\n3,4,5,6').buffer as ArrayBuffer, 'text/csv')
    render(<DocumentPreview url="/broken.csv" mimeType="text/csv" />)
    expect(await screen.findByText(/Inconsistent row lengths/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('surfaces an HTTP failure and offers a download', async () => {
    mockFetch(new ArrayBuffer(0), 'text/plain', { status: 404 })
    const onError = vi.fn()
    render(<DocumentPreview url="/missing.md" mimeType="text/markdown" onError={onError} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/HTTP 404/)
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', '/missing.md')
    await waitFor(() => expect(onError).toHaveBeenCalled())
  })

  it('refuses a document larger than maxBytes', async () => {
    mockFetch(new TextEncoder().encode('x'.repeat(4096)).buffer as ArrayBuffer, 'text/plain')
    render(<DocumentPreview url="/big.txt" mimeType="text/plain" maxBytes={100} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/limit/i)
  })

  it('shows the legacy-format state for a .doc', async () => {
    mockFetch(await fixture('legacy.doc'), 'application/msword')
    render(<DocumentPreview url="/old.doc" mimeType="application/msword" />)
    expect(await screen.findByText(/Legacy Office files/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument()
  })

  it('detects a mislabelled docx from its bytes rather than its MIME type', async () => {
    mockFetch(await fixture('mislabelled.bin'), 'application/octet-stream')
    const onLoad = vi.fn()
    render(<DocumentPreview url="/blob/abc" mimeType="application/octet-stream" onLoad={onLoad} />)
    await waitFor(() => expect(onLoad).toHaveBeenCalled())
    expect(onLoad.mock.calls[0][0].kind).toBe('docx')
  })

  it('lets a caller override a built-in renderer', async () => {
    mockFetch(textBody(), 'text/markdown')
    const Custom = ({ meta }: RendererProps) => <div>custom renderer for {meta.kind}</div>
    render(<DocumentPreview url="/notes.md" mimeType="text/markdown" renderers={{ markdown: Custom }} />)
    expect(await screen.findByText('custom renderer for markdown')).toBeInTheDocument()
  })

  it('explains how to supply a PDF worker instead of silently failing', async () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.4\n%%EOF\n').buffer as ArrayBuffer
    mockFetch(pdfBytes, 'application/pdf')
    // No `pdf` prop: the renderer cannot resolve a worker from inside the package.
    render(<DocumentPreview url="/doc.pdf" mimeType="application/pdf" onError={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/pdf\.worker/i)
    expect(alert).toHaveTextContent(/workerSrc/)
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
    const { rerender } = render(<DocumentPreview url="/a.md" mimeType="text/markdown" />)
    rerender(<DocumentPreview url="/b.md" mimeType="text/markdown" />)
    await waitFor(() => expect(abortSpy).toHaveBeenCalled())
  })

  it('does not refetch when an inline fetchOptions object is re-created', async () => {
    const spy = mockFetch(textBody(), 'text/markdown')
    const { rerender } = render(
      <DocumentPreview url="/notes.md" mimeType="text/markdown" fetchOptions={{ credentials: 'include' }} />,
    )
    await screen.findByRole('heading', { name: 'Heading' })
    rerender(
      <DocumentPreview url="/notes.md" mimeType="text/markdown" fetchOptions={{ credentials: 'include' }} />,
    )
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
  })
})
