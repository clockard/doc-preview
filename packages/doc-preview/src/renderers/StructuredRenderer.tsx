import { useMemo, useState } from 'react'
import type { RendererProps } from '../types'
import { Toolbar, ToolbarButton, ToolbarGroup } from '../chrome/Toolbar'
import { decodeText } from '../decodeText'
import { formatJson } from '../format/json'
import { formatXml } from '../format/xml'
import { HIGHLIGHT_LIMIT, tokenizeJson, tokenizeXml } from '../format/highlight'
import { Highlighted } from '../format/Highlighted'

/**
 * Pretty-printed JSON and XML with syntax highlighting.
 *
 * Both formats share everything except the formatter and the tokeniser, so they
 * share a renderer rather than duplicating the viewer shell twice over.
 */
export function StructuredRenderer({ data, meta }: RendererProps) {
  const isJson = meta.kind === 'json'
  const raw = useMemo(() => decodeText(data), [data])
  const formatted = useMemo(() => (isJson ? formatJson(raw) : formatXml(raw)), [raw, isJson])

  // Malformed input has nothing to pretty-print, so start on the raw text —
  // that is what someone diagnosing a broken document needs to see.
  const [pretty, setPretty] = useState(!formatted.error)
  const [wrap, setWrap] = useState(false)

  const shown = pretty && !formatted.error ? formatted.text : raw
  const lineCount = useMemo(() => shown.split('\n').length, [shown])

  const tokens = useMemo(() => {
    if (shown.length > HIGHLIGHT_LIMIT) return null
    return isJson ? tokenizeJson(shown) : tokenizeXml(shown)
  }, [shown, isJson])

  return (
    <div className="dp-code">
      <Toolbar>
        <ToolbarGroup>
          <span className="dp-toolbar__text dp-toolbar__text--wide">
            {isJson ? 'JSON' : 'XML'} · {lineCount.toLocaleString()} lines
          </span>
          {formatted.error && (
            <span className="dp-code__warning" title={formatted.error}>
              Could not be parsed — showing the original
            </span>
          )}
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label={pretty ? 'Show the original text' : 'Show formatted'}
            onClick={() => setPretty((value) => !value)}
            disabled={Boolean(formatted.error)}
          >
            {pretty ? 'Raw' : 'Pretty'}
          </ToolbarButton>
          <ToolbarButton label={wrap ? 'Disable wrapping' : 'Enable wrapping'} onClick={() => setWrap((w) => !w)}>
            {wrap ? 'No wrap' : 'Wrap'}
          </ToolbarButton>
        </ToolbarGroup>
      </Toolbar>

      <div className="dp-code__scroll">
        <pre className={wrap ? 'dp-code__pre dp-code__pre--wrap' : 'dp-code__pre'}>
          <code>{tokens ? <Highlighted tokens={tokens} /> : shown}</code>
        </pre>
      </div>
    </div>
  )
}
