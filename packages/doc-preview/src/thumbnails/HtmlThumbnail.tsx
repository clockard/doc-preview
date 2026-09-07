import { useEffect, useRef, useState } from 'react'
import type { ThumbnailProps } from '../types'
import { computeScale } from './thumbScale'
import { ThumbGlyph } from './ThumbGlyph'
import { decodeText } from '../decodeText'

/**
 * The document, rendered in an isolated iframe and scaled down.
 *
 * Same containment as HtmlRenderer: same-origin so the content can be
 * measured, but never allow-scripts.
 */
export function HtmlThumbnail({ data, meta, box, fit, onError }: ThumbnailProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [page, setPage] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let cancelled = false

    void (async () => {
      const { default: DOMPurify } = await import('dompurify')
      if (cancelled) return

      const frameDoc = frame.contentDocument
      if (!frameDoc) return

      try {
        const text = decodeText(data)
        const clean = DOMPurify.sanitize(text, {
          WHOLE_DOCUMENT: true,
          ADD_TAGS: ['style'],
          FORBID_TAGS: ['script'],
        })

        frameDoc.open()
        frameDoc.write(`<!doctype html>${clean}`)
        frameDoc.close()
        if (cancelled) return

        if (frameDoc.body) frameDoc.body.style.margin = '0'

        const rect = frameDoc.documentElement.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          setPage({ width: rect.width, height: rect.height })
        }
      } catch (err) {
        if (!cancelled) onError?.(err as Error)
      }
    })().catch(() => {
      /* Reported through onError; the boundary shows the fallback tile. */
    })

    return () => {
      cancelled = true
    }
  }, [data, onError])

  const scale = page ? computeScale(page, box, fit) : 0
  const offsetX = page && fit === 'contain' ? Math.max(0, (box.width - page.width * scale) / 2) : 0

  return (
    <div className="dp-thumb__stage">
      <iframe
        ref={frameRef}
        className="dp-thumb__frame"
        title=""
        aria-hidden="true"
        scrolling="no"
        sandbox="allow-same-origin"
        style={
          page
            ? {
                width: page.width,
                height: page.height,
                transform: `translateX(${offsetX}px) scale(${scale})`,
                transformOrigin: 'top left',
                visibility: 'visible',
              }
            : { visibility: 'hidden' }
        }
      />
      {!page && <ThumbGlyph kind={meta.kind} fileName={meta.fileName} loading />}
    </div>
  )
}
