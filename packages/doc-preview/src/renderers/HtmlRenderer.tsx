import { useEffect, useRef, useState } from 'react'
import type { RendererProps } from '../types'
import { Spinner } from '../chrome/Spinner'
import { decodeText } from '../decodeText'

/**
 * HTML, rendered inside a same-origin sandboxed iframe.
 *
 * Same containment as DocxRenderer, for the same reason: nothing in an HTML
 * file should ever execute, and whatever stylesheet it carries must not leak
 * into the host app. DOMPurify strips script tags and event-handler attributes
 * before a single byte reaches the iframe — the sandbox is defence in depth,
 * not the only line of defence.
 */
export function HtmlRenderer({ data, onError }: RendererProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let cancelled = false
    let observer: ResizeObserver | undefined

    void (async () => {
      const { default: DOMPurify } = await import('dompurify')
      if (cancelled) return

      const frameDoc = frame.contentDocument
      if (!frameDoc) return

      try {
        const text = decodeText(data)
        // WHOLE_DOCUMENT keeps <head> content (a document's own <style>, say)
        // rather than stripping it the way sanitising a fragment would.
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

        const sync = () => {
          if (cancelled || !frame.contentDocument) return
          const height = frame.contentDocument.documentElement.scrollHeight
          if (height > 0) frame.style.height = `${height}px`
        }
        sync()
        observer = new ResizeObserver(sync)
        observer.observe(frameDoc.documentElement)
        setStatus('ready')
      } catch (err) {
        if (!cancelled) onError?.(err as Error)
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
    <div className="dp-html">
      {status === 'loading' && <Spinner label="Rendering document…" />}
      <iframe
        ref={frameRef}
        className="dp-html__frame"
        title="Document preview"
        // No allow-scripts: nothing in an HTML document should ever execute.
        sandbox="allow-same-origin"
        style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
      />
    </div>
  )
}
