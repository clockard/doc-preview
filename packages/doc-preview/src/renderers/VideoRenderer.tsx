import { useEffect, useMemo, useState } from 'react'
import type { RendererProps } from '../types'
import { formatBytes } from '../useDocumentSource'

// Some browsers never dispatch `error` for a badly-truncated or malformed
// container — the resource selection algorithm can abandon it through a path
// that updates `.error` without ever firing the event. Without this, such a
// file would spin forever instead of reporting failure.
const STALL_TIMEOUT_MS = 8000

/**
 * Video, decoded and played by the browser rather than by us.
 *
 * Same trust model as ImageRenderer: whatever the browser can play works, and
 * a format it cannot decode reports that through the element's own error
 * event rather than a maintained whitelist. MOV in particular lands here on
 * every browser but Safari.
 */
export function VideoRenderer({ data, meta }: RendererProps) {
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  // A blob URL keeps the bytes out of the DOM, same reasoning as ImageRenderer.
  const src = useMemo(() => {
    const blob = new Blob([data], { type: meta.mimeType })
    return URL.createObjectURL(blob)
  }, [data, meta.mimeType])

  useEffect(() => () => URL.revokeObjectURL(src), [src])

  useEffect(() => {
    if (ready) return
    const timeout = window.setTimeout(() => setFailed(true), STALL_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [ready, src])

  if (failed) {
    return (
      <div className="dp-centred">
        <p className="dp-centred__label">{meta.fileName}</p>
        <p className="dp-centred__detail">
          This browser cannot play {meta.mimeType || 'this video format'}.
        </p>
        <a className="dp-button" href={meta.url} download={meta.fileName}>
          Download ({formatBytes(meta.byteLength)})
        </a>
      </div>
    )
  }

  return (
    <div className="dp-media">
      <video
        className="dp-media__video"
        src={src}
        controls
        onLoadedMetadata={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <p className="dp-media__label">
        {meta.fileName} · {formatBytes(meta.byteLength)}
      </p>
    </div>
  )
}
