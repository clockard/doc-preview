import type { ThumbFit } from '../types'

export interface Size {
  width: number
  height: number
}

/**
 * The scale that maps a document's natural size onto a tile.
 *
 * This is the only geometry in the thumbnail path — every renderer defers to it
 * rather than doing its own arithmetic, so `cover` and `contain` cannot drift
 * apart between formats.
 */
export function computeScale(
  natural: Size,
  box: Size,
  fit: ThumbFit,
  options?: { allowUpscale?: boolean },
): number {
  // A tile that has not been measured yet, or content with no intrinsic size,
  // would otherwise produce Infinity or NaN and paint a garbage frame.
  if (natural.width <= 0 || natural.height <= 0) return 0
  if (box.width <= 0 || box.height <= 0) return 0

  const byWidth = box.width / natural.width
  const byHeight = box.height / natural.height
  const scale = fit === 'cover' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight)

  // Document pages scale up to fill their tile; a 16px icon blown up to 200px
  // does not, which is the same call ImageRenderer makes when fitting.
  return options?.allowUpscale === false ? Math.min(1, scale) : scale
}
