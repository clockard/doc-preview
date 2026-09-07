import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Element } from 'pptxtojson'
import { borderToStyle, fillToStyle, transformToStyle, vAlignToFlex } from './pptxFill'

/** Sanitiser injected from the renderer so this module stays synchronous. */
export type Sanitize = (html: string) => string

interface Props {
  element: Element
  sanitize: Sanitize
}

/** Absolute box shared by every element type. */
function boxStyle(el: { left: number; top: number; width: number; height: number }): CSSProperties {
  return {
    position: 'absolute',
    left: `${el.left}px`,
    top: `${el.top}px`,
    width: `${el.width}px`,
    height: `${el.height}px`,
  }
}

export function SlideElement({ element, sanitize }: Props) {
  switch (element.type) {
    case 'text':
    case 'shape':
      return <TextualShape element={element} sanitize={sanitize} />

    case 'image': {
      const src = element.base64 || element.blob
      if (!src) return null
      return (
        <img
          src={src}
          alt=""
          style={{
            ...boxStyle(element),
            ...borderToStyle(element),
            ...transformToStyle(element),
            objectFit: 'fill',
          }}
        />
      )
    }

    case 'table':
      return (
        <div style={{ ...boxStyle(element), overflow: 'hidden' }}>
          <table className="dp-pptx__table">
            <tbody>
              {element.data.map((row, rowIndex) => (
                <tr key={rowIndex} style={{ height: element.rowHeights?.[rowIndex] }}>
                  {row.map((cell, cellIndex) => {
                    // vMerge/hMerge mark cells swallowed by a span above or left.
                    if (cell.vMerge || cell.hMerge) return null
                    return (
                      <td
                        key={cellIndex}
                        rowSpan={cell.rowSpan}
                        colSpan={cell.colSpan}
                        style={{
                          backgroundColor: cell.fillColor,
                          color: cell.fontColor,
                          fontWeight: cell.fontBold ? 600 : undefined,
                          verticalAlign: cell.vAlign === 'mid' ? 'middle' : cell.vAlign,
                          width: element.colWidths?.[cellIndex],
                        }}
                        dangerouslySetInnerHTML={{ __html: sanitize(cell.text ?? '') }}
                      />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'group':
      return (
        <div style={{ ...boxStyle(element), ...transformToStyle(element) }}>
          {/*
            Child coordinates are relative to the group box, so nesting a
            positioned container is enough — no coordinate arithmetic needed.
          */}
          {element.elements.map((child, index) => (
            <SlideElement key={index} element={child} sanitize={sanitize} />
          ))}
        </div>
      )

    case 'diagram':
      // SmartArt: the parser flattens it to shapes and text, which is a fair
      // approximation of the layout even though connectors are lost.
      return (
        <div style={boxStyle(element)}>
          {element.elements.map((child, index) => (
            <SlideElement key={index} element={child} sanitize={sanitize} />
          ))}
        </div>
      )

    case 'math':
      return (
        <div style={{ ...boxStyle(element), display: 'flex', alignItems: 'center' }}>
          {element.picBase64 ? (
            <img src={element.picBase64} alt={element.text ?? 'Equation'} style={{ width: '100%' }} />
          ) : (
            <code className="dp-pptx__math">{element.latex || element.text}</code>
          )}
        </div>
      )

    case 'chart':
      // Charts are deliberately not rendered: doing so would mean bundling a
      // charting engine for a read-only preview. The placeholder keeps the
      // slide's layout honest instead of leaving a hole.
      return (
        <div style={boxStyle(element)} className="dp-pptx__placeholder">
          <span>Chart</span>
        </div>
      )

    case 'video':
    case 'audio':
      return (
        <div style={boxStyle(element)} className="dp-pptx__placeholder">
          <span>{element.type === 'video' ? 'Video' : 'Audio'}</span>
        </div>
      )

    default:
      // Unknown element types are skipped rather than allowed to break the slide.
      return null
  }
}

/**
 * Shrink text until it fits its shape, the way PowerPoint's "shrink text on
 * overflow" does.
 *
 * This is not a nicety here: the fonts a deck names (Calibri, Aptos, …) are
 * almost never installed on the viewing machine, so the browser substitutes
 * something with different metrics and text that fit in PowerPoint no longer
 * fits. Without this, a title wraps one line further than the source did and
 * either gets clipped or collides with the element below it.
 *
 * `zoom` is used rather than `transform: scale()` because it reflows the text —
 * scaling after the fact would preserve the wrong line breaks.
 */
function useShrinkToFit(content: string | undefined) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text || !content) return

    text.style.zoom = '1'
    const availableWidth = box.clientWidth
    const availableHeight = box.clientHeight
    if (availableWidth === 0 || availableHeight === 0) return

    const MIN_SCALE = 0.35

    /**
     * `zoom` gives the element its own coordinate space, so the box's pixels
     * must be converted into it before comparing. Measuring a zoomed child
     * against its unzoomed parent makes everything look like it overflows and
     * shrinks it straight to the floor.
     */
    const fitsAt = (scale: number) => {
      text.style.zoom = String(scale)
      return (
        text.scrollWidth <= availableWidth / scale + 0.5 &&
        text.scrollHeight <= availableHeight / scale + 0.5
      )
    }

    if (fitsAt(1)) return

    // Shrink until it fits. Each pass reflows, so the next measurement reflects
    // the new line breaks.
    let tooBig = 1
    let scale = 1
    for (let pass = 0; pass < 6; pass += 1) {
      const needed = Math.min(
        availableWidth / scale / Math.max(text.scrollWidth, 1),
        availableHeight / scale / Math.max(text.scrollHeight, 1),
      )
      // Cap the step so a pathological measurement cannot stall the loop.
      tooBig = scale
      scale = Math.max(MIN_SCALE, scale * Math.min(needed, 0.94))
      if (fitsAt(scale) || scale === MIN_SCALE) break
    }

    /*
     * The estimate above is pessimistic: it is driven by the overflowing height
     * of *wrapped* text, but shrinking also unwraps it, so the first fitting
     * scale is usually well below the largest one that fits. Bisecting back up
     * recovers that — without it a title that needs a 5% reduction renders at
     * around half size.
     */
    let fitting = scale
    for (let pass = 0; pass < 5 && tooBig - fitting > 0.02; pass += 1) {
      const midpoint = (fitting + tooBig) / 2
      if (fitsAt(midpoint)) fitting = midpoint
      else tooBig = midpoint
    }
    text.style.zoom = String(fitting)
  }, [content])

  return { boxRef, textRef }
}

function TextualShape({ element, sanitize }: { element: Extract<Element, { type: 'text' | 'shape' }>; sanitize: Sanitize }) {
  const { boxRef, textRef } = useShrinkToFit(element.content)

  const isShape = element.type === 'shape'
  // A shape with no fill, no border and no text contributes nothing visible but
  // can still cover the elements beneath it.
  const style: CSSProperties = {
    ...boxStyle(element),
    ...fillToStyle(isShape && element.strokeOnly ? undefined : element.fill),
    ...borderToStyle(element),
    ...transformToStyle(element),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: vAlignToFlex(element.vAlign),
    // Shrinking handles the common case; anything still too big spills rather
    // than being cut off, which is also what PowerPoint does. The slide stage
    // clips, so nothing escapes the slide.
    overflow: 'visible',
  }

  const inset = element.textInset
  if (inset) {
    style.padding = `${inset.t ?? 0}px ${inset.r ?? 0}px ${inset.b ?? 0}px ${inset.l ?? 0}px`
  }

  if (!element.content) return <div style={style} />

  return (
    <div style={style} ref={boxRef}>
      <div
        ref={textRef}
        className="dp-pptx__text"
        dangerouslySetInnerHTML={{ __html: sanitize(element.content) }}
      />
    </div>
  )
}
