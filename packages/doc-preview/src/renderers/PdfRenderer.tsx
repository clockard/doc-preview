import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist'
import type { RendererProps } from '../types'
import { Spinner } from '../chrome/Spinner'
import { Toolbar, ToolbarButton, ToolbarGroup } from '../chrome/Toolbar'
import { documentParams, resolveAssets } from './pdfAssets'
import { extractPdfText, findPdfMatches, findPdfMatchRects, type PdfSearchMatch } from './pdfSearch'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export function PdfRenderer({ data, pdf, onError }: RendererProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState<number | 'fit-width'>('fit-width')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inBand = useRef(new Set<number>())

  /**
   * Track every page crossing the viewport's midline and report the topmost.
   *
   * Taking whichever page reported last instead would be wrong at mount, when
   * several pages are still laying out and all report in the same tick — the
   * indicator would settle on the last page of the document.
   */
  const setBandMembership = useCallback((pageNumber: number, isInside: boolean) => {
    const pages = inBand.current
    if (isInside) pages.add(pageNumber)
    else pages.delete(pageNumber)
    if (pages.size > 0) setCurrentPage(Math.min(...pages))
  }, [])

  // Resolved during render (not inside the effect) so a missing worker reaches
  // the error boundary as guidance rather than an endless spinner. Memoised on
  // the individual URLs: `pdf` is typically an inline object literal, and an
  // unstable identity here would tear down and rebuild the PDF loading task on
  // every render, which surfaces as "Transport destroyed".
  const assets = useMemo(
    () => resolveAssets(pdf),
    [pdf?.workerSrc, pdf?.cMapUrl, pdf?.standardFontDataUrl],
  )

  useEffect(() => {
    let cancelled = false
    GlobalWorkerOptions.workerSrc = assets.workerSrc

    const task = getDocument(documentParams(data, assets))

    task.promise.then(
      (result) => {
        if (cancelled) return
        setDoc(result)
        setPageCount(result.numPages)
      },
      (err: Error) => {
        if (!cancelled) onError?.(err)
      },
    )

    return () => {
      cancelled = true
      // Destroying the loading task tears down the document and its worker port.
      void task.destroy()
    }
  }, [data, assets, onError])

  const zoomIn = useCallback(() => {
    setScale((prev) => {
      const current = typeof prev === 'number' ? prev : 1
      return ZOOM_STEPS.find((step) => step > current + 0.001) ?? current
    })
  }, [])

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const current = typeof prev === 'number' ? prev : 1
      return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? current
    })
  }, [])

  const goToPage = useCallback((page: number) => {
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`)
    target?.scrollIntoView({ block: 'start' })
  }, [])

  /*
   * Search. Pages are virtualised, so unlike every other renderer here the
   * browser's own Ctrl+F cannot see the whole document — only whichever
   * pages currently have a text layer mounted near the viewport. This
   * exists specifically to search the pages that are not.
   */
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [indexing, setIndexing] = useState(false)
  const [search, setSearch] = useState<{ query: string; matches: PdfSearchMatch[] }>({
    query: '',
    matches: [],
  })
  const [matchIndex, setMatchIndex] = useState(0)
  const [activeHighlight, setActiveHighlight] = useState<{ page: number; rects: DOMRect[] } | null>(null)
  // Pages whose text layer has actually finished rendering — the real signal
  // `PdfPage` gives once `TextLayer.render()` resolves, rather than a guess
  // about how long that takes.
  const [readyPages, setReadyPages] = useState<ReadonlySet<number>>(() => new Set())
  const onTextReady = useCallback((pageNumber: number, ready: boolean) => {
    setReadyPages((prev) => {
      if (prev.has(pageNumber) === ready) return prev
      const next = new Set(prev)
      if (ready) next.add(pageNumber)
      else next.delete(pageNumber)
      return next
    })
  }, [])
  const pageTextRef = useRef<Map<number, string> | null>(null)

  // A new document invalidates any cached text and any prior search.
  useEffect(() => {
    pageTextRef.current = null
    setSearch({ query: '', matches: [] })
    setMatchIndex(0)
  }, [doc])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || !doc) {
      setSearch({ query: '', matches: [] })
      setMatchIndex(0)
      return
    }

    let cancelled = false
    void (async () => {
      if (!pageTextRef.current) {
        setIndexing(true)
        const extracted = await extractPdfText(doc)
        if (cancelled) return
        pageTextRef.current = extracted
        setIndexing(false)
      }
      const found = findPdfMatches(pageTextRef.current, trimmed)
      if (cancelled) return
      setSearch({ query: trimmed, matches: found })
      setMatchIndex(0)
    })()

    return () => {
      cancelled = true
    }
  }, [doc, query])

  // Jump to the current match, then — once its text layer has actually
  // finished rendering, per `readyPages` — highlight it. Scrolling the
  // target page into view triggers its own prefetch observer, but that
  // render is asynchronous, so this re-runs and picks the highlight up once
  // `onTextReady` reports it rather than guessing when it is done.
  useEffect(() => {
    const current = search.matches[matchIndex]
    if (!current) {
      setActiveHighlight(null)
      return
    }

    goToPage(current.page)

    if (!readyPages.has(current.page)) {
      setActiveHighlight(null)
      return
    }
    const container = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${current.page}"] .dp-pdf__text`)
    if (!container) {
      setActiveHighlight(null)
      return
    }
    setActiveHighlight({ page: current.page, rects: findPdfMatchRects(container, search.query) })
  }, [search, matchIndex, goToPage, readyPages])

  // The rects are a layout snapshot: a zoom change re-renders every page at a
  // new size and makes them stale. Dropping the highlight (rather than
  // re-scrolling to recompute it) avoids yanking the reader back to the top
  // of the page just because they zoomed.
  useEffect(() => {
    setActiveHighlight(null)
  }, [scale])

  const goToMatch = useCallback(
    (delta: number) => {
      setMatchIndex((i) => {
        const count = search.matches.length
        return count === 0 ? 0 : (i + delta + count) % count
      })
    },
    [search.matches.length],
  )

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
  }, [])

  if (!doc) return <Spinner label="Opening PDF…" />

  return (
    <div className="dp-pdf">
      <Toolbar>
        <ToolbarGroup>
          <ToolbarButton label="Previous page" onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
            ‹
          </ToolbarButton>
          <span className="dp-toolbar__text">
            {currentPage} / {pageCount}
          </span>
          <ToolbarButton
            label="Next page"
            onClick={() => goToPage(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
          >
            ›
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton label="Zoom out" onClick={zoomOut}>
            −
          </ToolbarButton>
          <span className="dp-toolbar__text">
            {scale === 'fit-width' ? 'Fit' : `${Math.round(scale * 100)}%`}
          </span>
          <ToolbarButton label="Zoom in" onClick={zoomIn}>
            +
          </ToolbarButton>
          <ToolbarButton label="Fit to width" onClick={() => setScale('fit-width')}>
            ⤢
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          {searchOpen ? (
            <>
              <input
                type="text"
                className="dp-pdf__search-input"
                placeholder="Find in document"
                value={query}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') goToMatch(event.shiftKey ? -1 : 1)
                  else if (event.key === 'Escape') closeSearch()
                }}
              />
              <span className="dp-toolbar__text dp-toolbar__text--wide">
                {indexing
                  ? 'Searching…'
                  : query.trim() === ''
                    ? ''
                    : search.matches.length === 0
                      ? 'No matches'
                      : `${matchIndex + 1} / ${search.matches.length} page${search.matches.length === 1 ? '' : 's'}`}
              </span>
              <ToolbarButton label="Previous match" onClick={() => goToMatch(-1)} disabled={search.matches.length === 0}>
                ‹
              </ToolbarButton>
              <ToolbarButton label="Next match" onClick={() => goToMatch(1)} disabled={search.matches.length === 0}>
                ›
              </ToolbarButton>
              <ToolbarButton label="Close search" onClick={closeSearch}>
                ×
              </ToolbarButton>
            </>
          ) : (
            <ToolbarButton label="Find in document" onClick={() => setSearchOpen(true)}>
              🔍
            </ToolbarButton>
          )}
        </ToolbarGroup>
      </Toolbar>

      <div className="dp-pdf__scroll" ref={scrollRef}>
        {Array.from({ length: pageCount }, (_, i) => (
          <PdfPage
            key={i + 1}
            doc={doc}
            pageNumber={i + 1}
            scale={scale}
            scrollRoot={scrollRef}
            onBandChange={setBandMembership}
            onTextReady={onTextReady}
            highlightRects={activeHighlight?.page === i + 1 ? activeHighlight.rects : undefined}
          />
        ))}
      </div>
    </div>
  )
}

interface PdfPageProps {
  doc: PDFDocumentProxy
  pageNumber: number
  scale: number | 'fit-width'
  scrollRoot: React.RefObject<HTMLDivElement | null>
  onBandChange: (page: number, isInside: boolean) => void
  /** Reports when this page's text layer has (and has not) finished rendering. */
  onTextReady: (pageNumber: number, ready: boolean) => void
  /** Search-match rectangles for this page, in this page's own coordinates. */
  highlightRects?: DOMRect[]
}

/**
 * One page, drawn only once it approaches the viewport. Rendering every page of
 * a long document up front is the difference between a snappy viewer and a
 * multi-second freeze, and the canvases alone would exhaust memory.
 */
function PdfPage({ doc, pageNumber, scale, scrollRoot, onBandChange, onTextReady, highlightRects }: PdfPageProps) {
  const holderRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [visible, setVisible] = useState(false)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Reserve the page's footprint before it renders, so the scrollbar does not
  // jump as pages resolve.
  useEffect(() => {
    let cancelled = false
    void doc.getPage(pageNumber).then((result) => {
      if (cancelled) return
      setPage(result)
      const viewport = result.getViewport({ scale: 1 })
      setSize({ width: viewport.width, height: viewport.height })
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber])

  // Two observers, because prefetching and "which page am I on" want opposite
  // margins. Driving both from one observer made every prefetched page claim to
  // be the current one, so the indicator showed the last page in the buffer.
  useEffect(() => {
    const node = holderRef.current
    if (!node) return

    // Render ahead of the viewport so scrolling does not reveal blank pages.
    const prefetch = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      { root: scrollRoot.current, rootMargin: '200% 0px' },
    )

    // A thin band across the middle of the viewport: the pages crossing it are
    // the ones the reader is actually looking at.
    const current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) onBandChange(pageNumber, entry.isIntersecting)
      },
      { root: scrollRoot.current, rootMargin: '-45% 0px -45% 0px' },
    )

    prefetch.observe(node)
    current.observe(node)
    return () => {
      prefetch.disconnect()
      current.disconnect()
      onBandChange(pageNumber, false)
    }
  }, [pageNumber, onBandChange, scrollRoot])

  useEffect(() => {
    if (!visible || !page || !canvasRef.current) return
    const canvas = canvasRef.current
    const textContainer = textRef.current
    let cancelled = false

    // Not ready for the duration of this render — most relevantly true again
    // right when a zoom change tears down the previous layer to rebuild it.
    onTextReady(pageNumber, false)

    const holderWidth = holderRef.current?.parentElement?.clientWidth ?? 800
    const base = page.getViewport({ scale: 1 })
    const effectiveScale =
      scale === 'fit-width' ? Math.max(0.1, (holderWidth - 48) / base.width) : scale
    const viewport = page.getViewport({ scale: effectiveScale })

    // Draw at device resolution so text stays crisp on HiDPI screens, while CSS
    // keeps the element at logical size.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const renderViewport = page.getViewport({ scale: effectiveScale * dpr })
    canvas.width = Math.floor(renderViewport.width)
    canvas.height = Math.floor(renderViewport.height)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const task = page.render({ canvas, viewport: renderViewport })
    void task.promise.then(
      async () => {
        if (cancelled || !textContainer) return
        // The text layer is what makes selection, copy and browser find work.
        textContainer.replaceChildren()
        textContainer.style.width = `${Math.floor(viewport.width)}px`
        textContainer.style.height = `${Math.floor(viewport.height)}px`
        // The one variable PDF.js's TextLayer expects the host page to
        // supply — see the comment on .dp-pdf__text in styles.css.
        textContainer.style.setProperty('--total-scale-factor', String(effectiveScale))
        const layer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textContainer,
          viewport,
        })
        await layer.render()
        if (cancelled) return
        onTextReady(pageNumber, true)
      },
      () => {
        /* Cancelled renders reject; nothing to report. */
      },
    )

    return () => {
      cancelled = true
      task.cancel()
    }
  }, [visible, page, scale, pageNumber, onTextReady])

  return (
    <div
      className="dp-pdf__page"
      data-page={pageNumber}
      ref={holderRef}
      style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
    >
      <canvas ref={canvasRef} className="dp-pdf__canvas" />
      <div ref={textRef} className="dp-pdf__text textLayer" />
      {/*
        A sibling of the text layer, not a child of it: `.dp-pdf__text` is
        dimmed to opacity 0.2 so native text selection shows through only
        faintly, and a highlight painted inside that container would inherit
        the same dimming with no way to opt back out from underneath it.
      */}
      {highlightRects && highlightRects.length > 0 && (
        <div className="dp-pdf__highlights">
          {highlightRects.map((rect, i) => (
            <mark
              key={i}
              className="dp-pdf__highlight"
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
