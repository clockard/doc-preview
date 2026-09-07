import { useEffect, useState } from 'react'
import type { Slide } from 'pptxtojson'
import type { ThumbnailProps } from '../types'
import { ThumbGlyph } from './ThumbGlyph'
import { ScaledSlide } from '../renderers/ScaledSlide'
import type { Sanitize } from '../renderers/SlideElement'
import { ptToPx } from '../renderers/pptxFill'
import { computeScale } from './thumbScale'

interface Deck {
  slide: Slide
  size: { width: number; height: number }
}

/**
 * Slide 1, through the same renderer the full viewer uses.
 *
 * The scale is handed to ScaledSlide directly rather than wrapping it in a
 * ThumbStage: SlideElement's shrink-to-fit measures scrollWidth against an
 * available width, and nesting a second transform around it is exactly the
 * scaling boundary that has broken that measurement before.
 */
export function PptxThumbnail({ data, meta, box, fit, onError }: ThumbnailProps) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [sanitize, setSanitize] = useState<Sanitize | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [{ parse }, { default: DOMPurify }] = await Promise.all([
          import('pptxtojson'),
          import('dompurify'),
        ])
        const result = await parse(data.slice(0), {
          imageMode: 'base64',
          videoMode: 'none',
          audioMode: 'none',
        })
        if (cancelled) return
        if (!result.slides?.length) {
          setDeck(null)
          return
        }
        // Wrapped in a function so React does not treat it as a state updater.
        setSanitize(() => (html: string) => ptToPx(DOMPurify.sanitize(html)))
        setDeck({ slide: result.slides[0], size: result.size })
      } catch (err) {
        if (!cancelled) onError?.(err as Error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data, onError])

  // Parsing an Office file is not instant; keep the typed tile up until it is.
  if (!deck || !sanitize) return <ThumbGlyph kind={meta.kind} fileName={meta.fileName} loading />

  const scale = computeScale(deck.size, box, fit)

  return (
    <div className="dp-thumb__stage">
      <ScaledSlide slide={deck.slide} size={deck.size} sanitize={sanitize} fixedScale={scale} />
    </div>
  )
}
