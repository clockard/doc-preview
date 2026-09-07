import { useEffect, useMemo, useState } from 'react'
import type { ThumbnailProps } from '../types'
import { ThumbGlyph } from './ThumbGlyph'

/**
 * The image itself, framed by object-fit.
 *
 * No transform and no measuring: the browser already does exactly this job, and
 * `cover`/`contain` map onto object-fit one for one.
 */
export function ImageThumbnail({ data, meta, fit }: ThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // A blob URL keeps the bytes out of the DOM; a data: URI for a large image
  // would be a multi-megabyte string sitting in an attribute.
  const src = useMemo(() => {
    const blob = new Blob([data], { type: meta.mimeType })
    return URL.createObjectURL(blob)
  }, [data, meta.mimeType])

  useEffect(() => () => URL.revokeObjectURL(src), [src])

  // TIFF lands here on every browser but Safari.
  if (failed) return <ThumbGlyph kind={meta.kind} fileName={meta.fileName} />

  return (
    <>
      {!loaded && <ThumbGlyph kind={meta.kind} fileName={meta.fileName} loading />}
      <img
        className="dp-thumb__image"
        src={src}
        alt=""
        draggable={false}
        style={{
          // `scale-down` is `contain` that never enlarges — the browser's own
          // version of the clamp ImageRenderer applies when fitting, so a 16px
          // icon stays 16px instead of being blown across the tile.
          objectFit: fit === 'contain' ? 'scale-down' : 'cover',
          objectPosition: fit === 'contain' ? 'center' : 'top center',
          // Hidden until decoded, so it does not flash over the placeholder.
          visibility: loaded ? 'visible' : 'hidden',
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  )
}
