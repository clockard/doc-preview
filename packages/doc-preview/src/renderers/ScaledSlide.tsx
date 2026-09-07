import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Slide } from 'pptxtojson'
import { SlideElement, type Sanitize } from './SlideElement'
import { fillToStyle } from './pptxFill'

export interface ScaledSlideProps {
  slide: Slide
  size: { width: number; height: number }
  sanitize: Sanitize
  /**
   * Render at this exact scale instead of measuring the container.
   *
   * The caller then owns the wrapper's dimensions — used by the filmstrip and by
   * the thumbnail, both of which already know the scale they want.
   */
  fixedScale?: number
}

/**
 * Render the slide at its native pixel size and scale the whole stage to fit.
 *
 * Every element keeps the parser's own coordinates, so a single CSS transform
 * replaces per-element scaling arithmetic — and nested groups keep working
 * without any extra handling.
 */
export function ScaledSlide({ slide, size, sanitize, fixedScale }: ScaledSlideProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState(0)

  useLayoutEffect(() => {
    if (fixedScale !== undefined) return
    const node = wrapRef.current
    if (!node) return
    const update = () => {
      const { width, height } = node.getBoundingClientRect()
      if (width === 0 || height === 0) return
      setMeasured(Math.min(width / size.width, height / size.height))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [size.width, size.height, fixedScale])

  const scale = fixedScale ?? measured

  const elements = useMemo(
    // Layout elements are the master/layout background furniture and belong
    // beneath the slide's own content.
    () => [...(slide.layoutElements ?? []), ...(slide.elements ?? [])],
    [slide],
  )

  return (
    <div
      className="dp-pptx__fit"
      ref={wrapRef}
      style={
        fixedScale !== undefined
          ? { width: size.width * fixedScale, height: size.height * fixedScale }
          : undefined
      }
    >
      <div
        className="dp-pptx__stage"
        style={{
          width: size.width,
          height: size.height,
          transform: `scale(${scale})`,
          ...fillToStyle(slide.fill),
        }}
      >
        {scale > 0 &&
          elements.map((element, i) => (
            <SlideElement key={i} element={element} sanitize={sanitize} />
          ))}
      </div>
    </div>
  )
}
