import type { CSSProperties, ReactNode } from 'react'
import type { ThumbFit } from '../types'
import { computeScale, type Size } from './thumbScale'

interface Props {
  /** The content's own size, in its own pixels, before scaling. */
  natural: Size
  box: Size
  fit: ThumbFit
  allowUpscale?: boolean
  /**
   * Overrides the fitted scale. For content with no intrinsic page — a
   * spreadsheet grid extends as far as it has cells — the caller decides how
   * much to show, and `cover`/`contain` have nothing to fit against.
   */
  scale?: number
  children: ReactNode
}

/**
 * Scale natural-size content into the tile and clip whatever overflows.
 *
 * Content keeps its own coordinates and a single transform does the fitting, so
 * a renderer never has to scale its own text, borders or cell widths.
 *
 * Cropping anchors to the top: a document tile should show its title, not its
 * middle. Under `contain` the result is centred horizontally instead, since a
 * letterboxed page hugging the left edge reads as a layout bug.
 */
export function ThumbStage({ natural, box, fit, allowUpscale, scale: override, children }: Props) {
  const scale = override ?? computeScale(natural, box, fit, { allowUpscale })
  const offsetX = fit === 'contain' ? Math.max(0, (box.width - natural.width * scale) / 2) : 0
  const offsetY = fit === 'contain' ? Math.max(0, (box.height - natural.height * scale) / 2) : 0

  const style: CSSProperties = {
    width: natural.width,
    height: natural.height,
    transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
    transformOrigin: 'top left',
  }

  return (
    <div className="dp-thumb__stage">
      <div className="dp-thumb__content" style={style}>
        {children}
      </div>
    </div>
  )
}
