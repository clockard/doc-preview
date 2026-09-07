import { useCallback, useEffect, useState } from 'react'
import type { Slide } from 'pptxtojson'
import type { RendererProps } from '../types'
import { Spinner } from '../chrome/Spinner'
import { Toolbar, ToolbarButton, ToolbarGroup } from '../chrome/Toolbar'
import { ScaledSlide } from './ScaledSlide'
import type { Sanitize } from './SlideElement'
import { ptToPx } from './pptxFill'

interface Deck {
  slides: Slide[]
  size: { width: number; height: number }
}

export function PptxRenderer({ data, onError }: RendererProps) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [sanitize, setSanitize] = useState<Sanitize | null>(null)
  const [index, setIndex] = useState(0)
  const [showNotes, setShowNotes] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [{ parse }, { default: DOMPurify }] = await Promise.all([
          import('pptxtojson'),
          import('dompurify'),
        ])
        // base64 keeps images inline, so nothing has to be fetched later and no
        // blob URLs need revoking when slides unmount.
        const result = await parse(data.slice(0), {
          imageMode: 'base64',
          videoMode: 'none',
          audioMode: 'none',
        })
        if (cancelled) return
        // Wrapped in a function so React does not treat it as a state updater.
        // Sanitise first, then normalise units — the parser emits both untrusted
        // markup and `pt` sizes that need rescaling to the stage's coordinates.
        setSanitize(() => (html: string) => ptToPx(DOMPurify.sanitize(html)))
        setDeck({ slides: result.slides, size: result.size })
      } catch (err) {
        if (!cancelled) onError?.(err as Error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data, onError])

  const goto = useCallback(
    (next: number) => {
      if (!deck) return
      setIndex(Math.max(0, Math.min(deck.slides.length - 1, next)))
    },
    [deck],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') goto(index + 1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') goto(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goto, index])

  if (!deck || !sanitize) return <Spinner label="Opening presentation…" />
  if (deck.slides.length === 0) {
    return (
      <div className="dp-centred">
        <p className="dp-centred__label">This presentation has no slides.</p>
      </div>
    )
  }

  const slide = deck.slides[index]

  return (
    <div className="dp-pptx">
      <Toolbar>
        <ToolbarGroup>
          <ToolbarButton label="Previous slide" onClick={() => goto(index - 1)} disabled={index === 0}>
            ‹
          </ToolbarButton>
          <span className="dp-toolbar__text">
            {index + 1} / {deck.slides.length}
          </span>
          <ToolbarButton
            label="Next slide"
            onClick={() => goto(index + 1)}
            disabled={index === deck.slides.length - 1}
          >
            ›
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label={showNotes ? 'Hide speaker notes' : 'Show speaker notes'}
            onClick={() => setShowNotes((v) => !v)}
          >
            Notes
          </ToolbarButton>
        </ToolbarGroup>
      </Toolbar>

      <div className="dp-pptx__stage-wrap">
        <ScaledSlide slide={slide} size={deck.size} sanitize={sanitize} />
      </div>

      {showNotes && (
        <div className="dp-pptx__notes">
          {slide.note ? (
            // Notes come back as HTML from the parser, not plain text.
            <div dangerouslySetInnerHTML={{ __html: sanitize(slide.note) }} />
          ) : (
            <p className="dp-pptx__notes--empty">No notes on this slide.</p>
          )}
        </div>
      )}

      <div className="dp-pptx__filmstrip">
        {deck.slides.map((thumb, i) => (
          <button
            key={i}
            type="button"
            className={i === index ? 'dp-pptx__thumb dp-pptx__thumb--active' : 'dp-pptx__thumb'}
            onClick={() => goto(i)}
            aria-label={`Slide ${i + 1}`}
          >
            <ScaledSlide slide={thumb} size={deck.size} sanitize={sanitize} fixedScale={128 / deck.size.width} />
            <span className="dp-pptx__thumb-number">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
