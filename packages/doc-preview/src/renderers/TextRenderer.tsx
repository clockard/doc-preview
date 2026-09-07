import { useMemo, useState } from 'react'
import type { RendererProps } from '../types'
import { Toolbar, ToolbarButton, ToolbarGroup } from '../chrome/Toolbar'
import { decodeText } from '../decodeText'

export function TextRenderer({ data }: RendererProps) {
  const text = useMemo(() => decodeText(data), [data])
  const [wrap, setWrap] = useState(true)
  const lines = useMemo(() => text.split('\n'), [text])

  return (
    <div className="dp-text">
      <Toolbar>
        <ToolbarGroup>
          <span className="dp-toolbar__text">{lines.length.toLocaleString()} lines</span>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton label={wrap ? 'Disable wrapping' : 'Enable wrapping'} onClick={() => setWrap((w) => !w)}>
            {wrap ? 'No wrap' : 'Wrap'}
          </ToolbarButton>
        </ToolbarGroup>
      </Toolbar>
      <div className="dp-text__scroll">
        <pre className={wrap ? 'dp-text__pre dp-text__pre--wrap' : 'dp-text__pre'}>
          <code>{text}</code>
        </pre>
      </div>
    </div>
  )
}
