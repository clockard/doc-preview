import { useEffect, useMemo, useRef, useState } from 'react'
import type { ThumbnailProps } from '../types'
import { ThumbGlyph } from './ThumbGlyph'

// Some browsers never dispatch `error` for a badly-truncated container; without
// this a tile for such a file would spin forever instead of falling back.
const STALL_TIMEOUT_MS = 8000

/**
 * The first frame, captured to a canvas and framed with object-fit — the same
 * "real page 1" treatment the PDF and PPTX tiles get, rather than falling
 * back to a generic icon.
 *
 * The video is muted and off-screen, and playback is never started: it is only
 * ever seeked to a still frame purely to grab a bitmap of it.
 */
export function VideoThumbnail({ data, meta, fit, onError }: ThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const src = useMemo(() => {
    const blob = new Blob([data], { type: meta.mimeType })
    return URL.createObjectURL(blob)
  }, [data, meta.mimeType])

  useEffect(() => () => URL.revokeObjectURL(src), [src])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false

    const capture = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      if (canvas.width === 0 || canvas.height === 0) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0)
      setFrame(canvas.toDataURL('image/png'))
    }

    const onFailure = () => {
      if (!cancelled) {
        setFailed(true)
        onError?.(new Error(`This browser cannot decode ${meta.mimeType || 'this video format'}.`))
      }
    }

    const timeout = window.setTimeout(onFailure, STALL_TIMEOUT_MS)

    const onMetadata = () => {
      window.clearTimeout(timeout)
      // A tiny offset past zero: some codecs report a black or empty frame
      // at exactly t=0.
      video.currentTime = Math.min(0.1, video.duration > 0 ? video.duration / 2 : 0)
    }

    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('seeked', capture)
    video.addEventListener('error', onFailure)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('seeked', capture)
      video.removeEventListener('error', onFailure)
    }
  }, [meta.mimeType, onError])

  // TIFF-style failure: a real format the browser just cannot decode.
  if (failed) return <ThumbGlyph kind={meta.kind} fileName={meta.fileName} />

  return (
    <>
      {!frame && <ThumbGlyph kind={meta.kind} fileName={meta.fileName} loading />}
      <video ref={videoRef} src={src} muted playsInline preload="auto" style={{ display: 'none' }} />
      {frame && (
        <img
          className="dp-thumb__image"
          src={frame}
          alt=""
          style={{
            objectFit: fit === 'contain' ? 'scale-down' : 'cover',
            objectPosition: fit === 'contain' ? 'center' : 'top center',
          }}
        />
      )}
    </>
  )
}
