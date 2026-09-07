import type { ThumbnailProps } from '../types'
import { ThumbGlyph } from './ThumbGlyph'

/**
 * Audio has no visual frame, so the tile is the typed icon — the same
 * treatment a legacy or unsupported format always gets, and PDF gets before
 * it has painted.
 */
export function AudioThumbnail({ meta }: ThumbnailProps) {
  return <ThumbGlyph kind={meta.kind} fileName={meta.fileName} />
}
