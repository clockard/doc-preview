import { useEffect, useMemo, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { ThumbnailProps } from '../types'
import { documentParams, resolveAssets } from '../renderers/pdfAssets'
import { computeScale } from './thumbScale'
import { ThumbGlyph } from './ThumbGlyph'

/**
 * Page 1, drawn straight to a canvas at tile size.
 *
 * No text layer: selection is meaningless in a thumbnail and building it is the
 * expensive half of a PDF.js render.
 */
export function PdfThumbnail({ data, meta, box, fit, pdf, onError }: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [painted, setPainted] = useState(false)

  // Resolved during render so a missing worker reaches the boundary as guidance.
  // Memoised on the individual URLs: an inline `pdf` object literal would
  // otherwise tear down and rebuild the loading task on every render.
  const assets = useMemo(
    () => resolveAssets(pdf),
    [pdf?.workerSrc, pdf?.cMapUrl, pdf?.standardFontDataUrl],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || box.width <= 0 || box.height <= 0) return

    let cancelled = false
    GlobalWorkerOptions.workerSrc = assets.workerSrc
    const task = getDocument(documentParams(data, assets))

    void task.promise.then(
      async (doc) => {
        if (cancelled) return
        const page = await doc.getPage(1)
        if (cancelled) return

        const base = page.getViewport({ scale: 1 })
        const scale = computeScale(base, box, fit)
        const viewport = page.getViewport({ scale })

        // Draw at device resolution so a small tile still looks sharp.
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const renderViewport = page.getViewport({ scale: scale * dpr })
        canvas.width = Math.max(1, Math.floor(renderViewport.width))
        canvas.height = Math.max(1, Math.floor(renderViewport.height))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        await page.render({ canvas, viewport: renderViewport }).promise
        if (!cancelled) setPainted(true)
      },
      (err: Error) => {
        if (!cancelled) onError?.(err)
      },
    )

    return () => {
      cancelled = true
      setPainted(false)
      // Destroying the loading task tears down the document and its worker port.
      void task.destroy()
    }
  }, [data, assets, box.width, box.height, fit, onError])

  return (
    <div className="dp-thumb__stage">
      <canvas
        ref={canvasRef}
        className="dp-thumb__canvas"
        // The canvas is in the DOM from the first frame but stays blank until
        // PDF.js finishes; showing it early would flash an empty white box.
        style={{ visibility: painted ? 'visible' : 'hidden' }}
      />
      {!painted && <ThumbGlyph kind={meta.kind} fileName={meta.fileName} loading />}
    </div>
  )
}
