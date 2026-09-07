import { useEffect, useMemo, useState } from 'react'
import type { RendererProps } from '../types'
import { formatBytes } from '../useDocumentSource'

// Some browsers never dispatch `error` for a badly-truncated or malformed
// file — without this, such a file would spin forever instead of reporting
// failure. Same reasoning as VideoRenderer.
const STALL_TIMEOUT_MS = 8000

/**
 * Audio, decoded and played by the browser rather than by us. Same trust
 * model as VideoRenderer and ImageRenderer.
 */
export function AudioRenderer({ data, meta }: RendererProps) {
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

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
          This browser cannot play {meta.mimeType || 'this audio format'}.
        </p>
        <a className="dp-button" href={meta.url} download={meta.fileName}>
          Download ({formatBytes(meta.byteLength)})
        </a>
      </div>
    )
  }

  return (
    <div className="dp-media">
      <p className="dp-media__label">
        {meta.fileName} · {formatBytes(meta.byteLength)}
      </p>
      <audio
        className="dp-media__audio"
        src={src}
        controls
        onLoadedMetadata={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
