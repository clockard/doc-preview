import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DocumentThumbnailProps } from './types'
import { useDocumentSource } from './useDocumentSource'
import { THUMBNAILS } from './thumbRegistry'
import { fileNameOf, guessKind } from './resolveKind'
import { RendererBoundary } from './chrome/RendererBoundary'
import { ThumbGlyph } from './thumbnails/ThumbGlyph'
import './styles.css'

/** A tile is not worth a 100 MB download the way a full preview might be. */
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

/**
 * A single representative frame of a document — page 1, slide 1, the top-left of
 * the first sheet, the image itself, the opening lines of a text file.
 *
 * Deliberately inert: no toolbars, no keyboard or pointer handlers, nothing bound
 * to `window`. The full renderers bind global key listeners, which is fine for one
 * open document and actively wrong for twenty tiles in a grid. Callers supply their
 * own interaction by wrapping the tile in a button or link.
 */
export function DocumentThumbnail({
  url,
  mimeType,
  fileName,
  fetchOptions,
  maxBytes = DEFAULT_MAX_BYTES,
  width,
  height,
  fit = 'cover',
  mode = 'render',
  lazy = true,
  rootMargin = '300px',
  className,
  onLoad,
  onError,
  thumbnails,
  pdf,
}: DocumentThumbnailProps) {
  const iconOnly = mode === 'icon'
  const rootRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!lazy)
  const [box, setBox] = useState({ width: width ?? 0, height: height ?? 0 })

  /*
   * Hold the fetch until the tile approaches the viewport. This is the whole
   * point of `lazy`: a file listing with two hundred tiles must not open two
   * hundred connections the moment it mounts.
   */
  useEffect(() => {
    if (iconOnly || !lazy || visible) return
    const node = rootRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [iconOnly, lazy, visible, rootMargin])

  // Measure rather than trust the props, so a tile sized entirely in CSS works.
  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node) return
    const update = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setBox((prev) =>
          prev.width === rect.width && prev.height === rect.height
            ? prev
            : { width: rect.width, height: rect.height },
        )
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const source = useDocumentSource({
    url,
    mimeType,
    fileName,
    fetchOptions,
    maxBytes,
    // Nothing is drawn from the bytes in icon mode, so nothing is downloaded.
    enabled: visible && !iconOnly,
  })
  const { status, data, meta } = source

  useEffect(() => {
    if (!iconOnly && status === 'ready' && meta) onLoad?.(meta)
  }, [iconOnly, status, meta, onLoad])

  useEffect(() => {
    if (status === 'error' && source.error) onError?.(source.error)
  }, [status, source.error, onError])

  /*
   * What the MIME hint and file name say on their own, before a single byte has
   * arrived. A document can be slow to download, and this is what lets the tile
   * show the right kind of file from the first frame instead of a blank box that
   * only becomes a spreadsheet several seconds later.
   */
  const guess = useMemo(
    () => guessKind({ mimeType, fileName, url }),
    [mimeType, fileName, url],
  )

  const Thumbnail = useMemo(() => {
    if (!meta) return undefined
    return thumbnails?.[meta.kind] ?? THUMBNAILS[meta.kind]
  }, [meta, thumbnails])

  /*
   * The tile's accessible name. Falls back to the URL's own basename rather than
   * the whole URL: in icon mode no metadata ever arrives, so without this every
   * tile in a listing would announce a full path.
   */
  const label = meta?.fileName ?? fileNameOf(url, fileName)
  const rootClass = className ? `dp-thumb ${className}` : 'dp-thumb'
  const style = { width, height }

  const measured = box.width > 0 && box.height > 0
  // The detected kind once known, the hint's guess until then.
  const shownKind = meta?.kind ?? guess?.kind
  const placeholder = <ThumbGlyph kind={shownKind} fileName={label} loading />

  let body: React.ReactNode
  let state: 'loading' | 'ready' | 'error'
  if (iconOnly) {
    // Nothing to wait for: the icon is the whole tile, drawn on the first frame.
    state = 'ready'
    body = <ThumbGlyph kind={guess?.kind} fileName={label} />
  } else if (status === 'error') {
    state = 'error'
    body = <ThumbGlyph kind={shownKind} fileName={label} />
  } else if (status === 'loading' || !data || !meta || !measured) {
    state = 'loading'
    body = placeholder
  } else if (!Thumbnail) {
    state = 'ready'
    body = <ThumbGlyph kind={shownKind} fileName={label} />
  } else {
    state = 'ready'
    body = (
      <RendererBoundary
        resetKey={url}
        onError={onError}
        fallback={() => <ThumbGlyph kind={shownKind} fileName={label} />}
      >
        <Suspense fallback={placeholder}>
          <Thumbnail data={data} meta={meta} box={box} fit={fit} pdf={pdf} onError={onError} />
        </Suspense>
      </RendererBoundary>
    )
  }

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={style}
      role="img"
      aria-label={label}
      /*
       * The kind the tile is actually showing: detected in render mode, and the
       * hint's guess in icon mode, where nothing is fetched to detect from.
       */
      data-kind={iconOnly ? (guess?.kind ?? 'unknown') : (meta?.kind ?? 'loading')}
      data-state={state}
      data-mode={mode}
      data-fit={fit}
    >
      {/*
        The rendered document is decoration: the tile already announces itself
        through aria-label, and without this a grid would read out every file's
        body text in full.
      */}
      <div className="dp-thumb__inner" aria-hidden="true">
        {body}
      </div>
    </div>
  )
}
