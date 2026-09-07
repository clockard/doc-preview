import { useEffect, useRef, useState } from 'react'
import type { ThumbnailProps } from '../types'
import { computeScale } from './thumbScale'
import { ThumbGlyph } from './ThumbGlyph'

/**
 * Page 1 of the document, rendered in an isolated iframe and scaled down.
 *
 * Same containment as DocxRenderer: same-origin so the page can be measured,
 * but never `allow-scripts` — nothing in a Word file should execute. Pages after
 * the first are hidden with CSS rather than removed, so docx-preview's own
 * layout is left exactly as it produced it.
 */
export function DocxThumbnail({ data, meta, box, fit, onError }: ThumbnailProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [page, setPage] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let cancelled = false

    void (async () => {
      const [{ renderAsync }, { default: DOMPurify }] = await Promise.all([
        import('docx-preview'),
        import('dompurify'),
      ])
      if (cancelled) return

      const frameDoc = frame.contentDocument
      if (!frameDoc) return

      frameDoc.open()
      frameDoc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
      frameDoc.close()

      const styleHost = frameDoc.createElement('div')
      frameDoc.body.appendChild(styleHost)
      const container = frameDoc.createElement('div')
      frameDoc.body.appendChild(container)

      frameDoc.body.style.margin = '0'
      frameDoc.body.style.background = 'transparent'

      // Keep only the first page. docx-preview emits one <section> per page
      // when breakPages is on, so this is a pure display concern.
      const only = frameDoc.createElement('style')
      only.textContent = 'section.docx ~ section.docx { display: none !important; }'
      frameDoc.head.appendChild(only)

      try {
        await renderAsync(data, container, styleHost, {
          inWrapper: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: false,
          useBase64URL: true,
        })
        if (cancelled) return

        DOMPurify.sanitize(container, { IN_PLACE: true, ADD_TAGS: ['style'], ADD_ATTR: ['target'] })

        const first = container.querySelector<HTMLElement>('section.docx')
        if (!first) return
        const rect = first.getBoundingClientRect()
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
        // No allow-scripts: nothing in a Word document should ever execute.
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
