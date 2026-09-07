import type { DocKind } from '../types'
import { extensionOf } from '../resolveKind'
import { FileIcon } from './FileIcon'

interface Props {
  /** Detected kind, or the guess from the MIME hint while still loading. */
  kind?: DocKind
  fileName?: string
  /** Overrides the extension derived from the file name. */
  label?: string
  /** Dims and pulses: the real thumbnail is still on its way. */
  loading?: boolean
}

/**
 * The typed tile shown when there is no rendered document to show — while one is
 * still downloading or parsing, and permanently for a legacy or unknown format,
 * an undecodable image, or a parse failure.
 *
 * It names the format rather than showing a generic box: in a grid, knowing a
 * tile is a spreadsheet is most of what the reader wanted, and showing it from
 * the first frame means a slow download does not leave an anonymous grey square.
 */
export function ThumbGlyph({ kind, fileName, label, loading }: Props) {
  const text = (label ?? (fileName ? extensionOf(fileName) : '')).toUpperCase()
  const className = loading ? 'dp-thumb__glyph dp-thumb__glyph--loading' : 'dp-thumb__glyph'

  return (
    <div className={className}>
      <FileIcon kind={kind} />
      {text && <span className="dp-thumb__glyph-label">{text}</span>}
    </div>
  )
}
