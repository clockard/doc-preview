import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { ThumbnailProps } from '../types'
import { decodeText } from '../decodeText'
import { formatJson } from '../format/json'
import { formatXml } from '../format/xml'
import { tokenizeJson, tokenizeXml } from '../format/highlight'
import { Highlighted } from '../format/Highlighted'
import { ThumbStage } from './ThumbStage'

/** The page the content is laid out on before being scaled into the tile. */
const PAGE_WIDTH = 640

/**
 * Only the opening of the file is ever visible, and formatting or tokenising a
 * 40 MB payload to show forty lines of it is pure waste.
 */
const PREFIX_BYTES = 8 * 1024

function truncate(text: string): string {
  if (text.length <= PREFIX_BYTES) return text
  const cut = text.slice(0, PREFIX_BYTES)
  // Cut on a line boundary so the last visible line is not half a token.
  const lastBreak = cut.lastIndexOf('\n')
  return lastBreak > 0 ? cut.slice(0, lastBreak) : cut
}

/**
 * Markdown, plain text, JSON and XML tiles.
 *
 * They share a shell for the same reason StructuredRenderer merges JSON and XML:
 * everything but the formatter is identical. The page is laid out at a fixed
 * width and scaled, so the text keeps sensible proportions no matter the tile.
 */
export function TextThumbnail({ data, meta, box, fit }: ThumbnailProps) {
  const text = useMemo(() => truncate(decodeText(data)), [data])

  const body = useMemo(() => {
    if (meta.kind === 'markdown') {
      return (
        <div className="dp-thumb__prose">
          {/* Untrusted content by definition — sanitising is not optional. */}
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {text}
          </Markdown>
        </div>
      )
    }

    if (meta.kind === 'json' || meta.kind === 'xml') {
      const isJson = meta.kind === 'json'
      const formatted = isJson ? formatJson(text) : formatXml(text)
      // A truncated prefix often will not parse; the raw text is the honest
      // fallback and still looks like the file it came from.
      const shown = formatted.error ? text : formatted.text
      const tokens = isJson ? tokenizeJson(shown) : tokenizeXml(shown)
      return (
        <pre className="dp-thumb__pre">
          <code>
            <Highlighted tokens={tokens} />
          </code>
        </pre>
      )
    }

    return (
      <pre className="dp-thumb__pre">
        <code>{text}</code>
      </pre>
    )
  }, [text, meta.kind])

  // Height is whatever the content needs; the stage clips it to the tile.
  const natural = { width: PAGE_WIDTH, height: Math.round(PAGE_WIDTH * (box.height / box.width || 1.3)) }

  return (
    <ThumbStage natural={natural} box={box} fit={fit}>
      <div className="dp-thumb__page">{body}</div>
    </ThumbStage>
  )
}
