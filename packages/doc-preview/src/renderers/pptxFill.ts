import type { CSSProperties } from 'react'
import type { Fill } from 'pptxtojson'

/** Translate a pptxtojson fill descriptor into CSS background properties. */
export function fillToStyle(fill: Fill | undefined): CSSProperties {
  if (!fill) return {}

  switch (fill.type) {
    case 'color':
      return fill.value ? { backgroundColor: fill.value } : {}

    case 'image': {
      const src = fill.value.base64 || fill.value.blob
      if (!src) return {}
      return {
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: fill.value.opacity ?? undefined,
      }
    }

    case 'gradient': {
      const stops = fill.value.colors
        .map((stop) => `${stop.color} ${stop.pos}`)
        .join(', ')
      if (!stops) return {}
      // PowerPoint measures rotation from the positive x-axis; CSS linear-gradient
      // measures from "to top", so the angle needs a quarter-turn offset.
      return fill.value.path === 'line'
        ? { backgroundImage: `linear-gradient(${(fill.value.rot ?? 0) + 90}deg, ${stops})` }
        : { backgroundImage: `radial-gradient(circle, ${stops})` }
    }

    case 'pattern':
      // Rendering the hatch itself is not worth it; the background colour keeps
      // contrast roughly right for text sitting on top.
      return fill.value.backgroundColor ? { backgroundColor: fill.value.backgroundColor } : {}

    default:
      return {}
  }
}

/** Border properties shared by shapes, text boxes and images. */
export function borderToStyle(el: {
  borderWidth?: number
  borderColor?: string
  borderType?: string
  borderStrokeDasharray?: string
}): CSSProperties {
  if (!el.borderWidth || !el.borderColor) return {}
  return {
    borderWidth: `${el.borderWidth}px`,
    borderColor: el.borderColor,
    borderStyle: el.borderType || 'solid',
  }
}

/** Rotation and mirroring, combined into a single transform. */
export function transformToStyle(el: {
  rotate?: number
  isFlipH?: boolean
  isFlipV?: boolean
}): CSSProperties {
  const parts: string[] = []
  if (el.rotate) parts.push(`rotate(${el.rotate}deg)`)
  if (el.isFlipH) parts.push('scaleX(-1)')
  if (el.isFlipV) parts.push('scaleY(-1)')
  return parts.length ? { transform: parts.join(' ') } : {}
}

export function vAlignToFlex(vAlign?: string): CSSProperties['justifyContent'] {
  switch (vAlign) {
    case 'mid':
    case 'ctr':
    case 'center':
      return 'center'
    case 'down':
    case 'b':
    case 'bottom':
      return 'flex-end'
    default:
      return 'flex-start'
  }
}

/**
 * Rewrite `pt` lengths inside style attributes to `px`.
 *
 * pptxtojson reports geometry in points (a 960x540 px slide comes back as
 * 720x405), but leaves font sizes in the source's `pt` units. The browser then
 * renders 1pt as 1.333px, so text comes out a third too large for the box it was
 * measured into and overflows — the slide title clips to its first word.
 *
 * Inside the stage, one unit *is* one point, so 1pt must map to 1px. Only
 * numeric lengths within style attributes are touched, never text content.
 */
export function ptToPx(html: string): string {
  return html.replace(/style="([^"]*)"/g, (match, style: string) =>
    match.replace(style, style.replace(/(\d*\.?\d+)pt\b/g, '$1px')),
  )
}
