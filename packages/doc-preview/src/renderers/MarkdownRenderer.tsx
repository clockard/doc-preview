import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { RendererProps } from '../types'
import { decodeText } from '../decodeText'

export function MarkdownRenderer({ data }: RendererProps) {
  const text = useMemo(() => decodeText(data), [data])

  return (
    <div className="dp-markdown">
      <div className="dp-markdown__body">
        {/*
          rehype-sanitize is not optional here. Markdown permits raw HTML, and
          this content is untrusted by definition.
        */}
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
          {text}
        </Markdown>
      </div>
    </div>
  )
}
