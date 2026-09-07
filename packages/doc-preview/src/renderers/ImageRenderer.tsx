import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RendererProps } from '../types'
import { Toolbar, ToolbarButton, ToolbarGroup } from '../chrome/Toolbar'
import { formatBytes } from '../useDocumentSource'

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 16]
const MIN_ZOOM = ZOOM_STEPS[0]
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]

type Zoom = number | 'fit'

/**
 * Images, decoded by the browser rather than by us.
 *
 * Anything the browser can display works — PNG, JPEG, WebP, AVIF, GIF, BMP,
 * SVG — and formats it cannot decode surface through the image's own error
 * event. That is deliberately open-ended: maintaining a whitelist would mean
 * rejecting formats the browser gained support for after this was written.
 */
export function ImageRenderer({ data, meta }: RendererProps) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [fitScale, setFitScale] = useState(1)

  const viewportRef = useRef<HTMLDivElement>(null)

  // A blob URL keeps the bytes out of the DOM: a data: URI for a large image
  // would mean a base64 string several megabytes long sitting in an attribute.
  const src = useMemo(() => {
    const blob = new Blob([data], { type: meta.mimeType })
    return URL.createObjectURL(blob)
  }, [data, meta.mimeType])

  useEffect(() => () => URL.revokeObjectURL(src), [src])

  // Recompute the fit scale whenever the pane or the image changes size.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !natural) return

    const update = () => {
      const { clientWidth, clientHeight } = viewport
      if (clientWidth === 0 || clientHeight === 0) return
      const padding = 32
      // Never scale up to fit: a small icon blown across the pane looks broken.
      setFitScale(
        Math.min(
          1,
          (clientWidth - padding) / natural.width,
          (clientHeight - padding) / natural.height,
        ),
      )
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [natural])

  const scale = zoom === 'fit' ? fitScale : zoom

  /** Zoom about a point so the pixel under the cursor stays put. */
  const zoomTo = useCallback(
    (next: number, anchor?: { x: number; y: number }) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
      const viewport = viewportRef.current
      if (!viewport || !natural) {
        setZoom(clamped)
        return
      }

      const rect = viewport.getBoundingClientRect()
      const point = anchor ?? { x: rect.width / 2, y: rect.height / 2 }
      const previous = scale
      // Where in the image the anchor currently sits, in image coordinates.
      const imageX = (viewport.scrollLeft + point.x) / previous
      const imageY = (viewport.scrollTop + point.y) / previous

      setZoom(clamped)

      // The new layout is only measurable after paint.
      requestAnimationFrame(() => {
        viewport.scrollLeft = imageX * clamped - point.x
        viewport.scrollTop = imageY * clamped - point.y
      })
    },
    [natural, scale],
  )

  const zoomIn = useCallback(() => {
    zoomTo(ZOOM_STEPS.find((step) => step > scale + 0.001) ?? MAX_ZOOM)
  }, [scale, zoomTo])

  const zoomOut = useCallback(() => {
    zoomTo([...ZOOM_STEPS].reverse().find((step) => step < scale - 0.001) ?? MIN_ZOOM)
  }, [scale, zoomTo])

  /*
   * Only ctrl/⌘ + wheel zooms. Hijacking a plain wheel would trap the page's
   * scroll whenever the pointer crossed an embedded preview, and this component
   * does not own the page it sits in.
   *
   * Registered natively rather than through React's onWheel: React attaches
   * wheel listeners as passive, where preventDefault() is ignored — so the
   * browser would apply its own ctrl+wheel page zoom on top of ours.
   */
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const factor = Math.exp(-event.deltaY / 300)
      zoomTo(scale * factor, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [scale, zoomTo])

  // Drag to pan, so a zoomed image does not have to be chased with scrollbars.
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (!viewport || event.button !== 0) return
    const overflows =
      viewport.scrollWidth > viewport.clientWidth || viewport.scrollHeight > viewport.clientHeight
    if (!overflows) return
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const start = drag.current
    if (!viewport || !start) return
    viewport.scrollLeft = start.left - (event.clientX - start.x)
    viewport.scrollTop = start.top - (event.clientY - start.y)
  }, [])

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') zoomIn()
      else if (event.key === '-') zoomOut()
      else if (event.key === '0') setZoom('fit')
      else if (event.key === '1') zoomTo(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIn, zoomOut, zoomTo])

  if (failed) {
    return (
      <div className="dp-centred">
        <p className="dp-centred__label">{meta.fileName}</p>
        <p className="dp-centred__detail">
          This browser cannot display {meta.mimeType || 'this image format'}.
        </p>
        <a className="dp-button" href={meta.url} download={meta.fileName}>
          Download ({formatBytes(meta.byteLength)})
        </a>
      </div>
    )
  }

  return (
    <div className="dp-image">
      <Toolbar>
        <ToolbarGroup>
          <span className="dp-toolbar__text dp-toolbar__text--wide">
            {natural ? `${natural.width} × ${natural.height}` : '…'} · {formatBytes(meta.byteLength)}
          </span>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton label="Zoom out" onClick={zoomOut} disabled={scale <= MIN_ZOOM}>
            −
          </ToolbarButton>
          <span className="dp-toolbar__text">{Math.round(scale * 100)}%</span>
          <ToolbarButton label="Zoom in" onClick={zoomIn} disabled={scale >= MAX_ZOOM}>
            +
          </ToolbarButton>
          <ToolbarButton label="Fit to window" onClick={() => setZoom('fit')}>
            Fit
          </ToolbarButton>
          <ToolbarButton label="Actual size" onClick={() => zoomTo(1)}>
            1:1
          </ToolbarButton>
        </ToolbarGroup>
      </Toolbar>

      <div
        className={dragging ? 'dp-image__viewport dp-image__viewport--dragging' : 'dp-image__viewport'}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => (zoom === 'fit' ? zoomTo(1) : setZoom('fit'))}
      >
        <img
          className="dp-image__img"
          src={src}
          alt={meta.fileName}
          draggable={false}
          style={
            natural
              ? { width: natural.width * scale, height: natural.height * scale }
              : { visibility: 'hidden' }
          }
          onLoad={(event) => {
            const img = event.currentTarget
            setNatural({
              // SVGs without intrinsic dimensions report 0; fall back to the box.
              width: img.naturalWidth || img.width || 300,
              height: img.naturalHeight || img.height || 150,
            })
          }}
          onError={() => setFailed(true)}
        />
      </div>
    </div>
  )
}
