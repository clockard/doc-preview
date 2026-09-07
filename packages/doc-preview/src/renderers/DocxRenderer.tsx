import { useEffect, useRef, useState } from 'react'
import type { RendererProps } from '../types'
import { Spinner } from '../chrome/Spinner'

/**
 * DOCX is rendered inside a same-origin iframe rather than into the host DOM.
 *
 * docx-preview accepts any HTMLElement as its container, so this costs nothing
 * and buys two things at once: the stylesheet it injects (which targets broad
 * selectors and would otherwise leak into the surrounding app) stays contained,
 * and untrusted document markup is kept out of the host document. The iframe is
 * same-origin so we can still measure content and size it to fit.
 */
export function DocxRenderer({ data, onError }: RendererProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let cancelled = false
    let observer: ResizeObserver | undefined

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

      try {
        await renderAsync(data, container, styleHost, {
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          useBase64URL: true,
        })
        if (cancelled) return

        // Defence in depth: the iframe already contains the markup, but this
        // strips script and event-handler attributes from the rendered output.
        DOMPurify.sanitize(container, { IN_PLACE: true, ADD_TAGS: ['style'], ADD_ATTR: ['target'] })

        const sync = () => {
          if (cancelled || !frame.contentDocument) return
          const height = frame.contentDocument.body.scrollHeight
          if (height > 0) frame.style.height = `${height}px`
        }
        sync()
        observer = new ResizeObserver(sync)
        observer.observe(frameDoc.body)
        setStatus('ready')
      } catch (err) {
        if (!cancelled) onError?.(err as Error)
        throw err
      }
    })().catch(() => {
      /* Reported through onError; the boundary shows the error state. */
    })

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [data, onError])

  return (
    <div className="dp-docx">
      {status === 'loading' && <Spinner label="Rendering document…" />}
      <iframe
        ref={frameRef}
        className="dp-docx__frame"
        title="Document preview"
        // No allow-scripts: nothing in a Word document should ever execute.
        sandbox="allow-same-origin"
        style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
      />
    </div>
  )
}
