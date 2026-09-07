import { useMemo, useState } from 'react'
import type { RendererProps } from '../types'
import { Toolbar, ToolbarButton, ToolbarGroup } from '../chrome/Toolbar'
import { decodeText } from '../decodeText'
import { detectDelimiter, parseCsv } from '../format/csv'

/**
 * CSV/TSV as an actual table, with a Raw toggle for the original text — the
 * same pretty/raw pattern StructuredRenderer already uses for JSON and XML.
 *
 * Malformed input is not swallowed into a misleading grid: a ragged row count
 * starts the view on Raw, the same call XML already makes for input its
 * parser cannot make sense of.
 */
export function CsvRenderer({ data }: RendererProps) {
  const raw = useMemo(() => decodeText(data), [data])
  const delimiter = useMemo(() => detectDelimiter(raw), [raw])
  const parsed = useMemo(() => parseCsv(raw, delimiter), [raw, delimiter])

  const [tableRequested, setTableRequested] = useState(true)
  const [wrap, setWrap] = useState(false)
  const showTable = tableRequested && !parsed.ragged

  const rowCount = parsed.rows.length
  const colCount = parsed.rows[0]?.length ?? 0

  return (
    <div className="dp-csv">
      <Toolbar>
        <ToolbarGroup>
          <span className="dp-toolbar__text dp-toolbar__text--wide">
            {rowCount.toLocaleString()} rows · {colCount.toLocaleString()} columns
          </span>
          {parsed.ragged && (
            <span className="dp-code__warning" title="Row lengths are inconsistent">
              Inconsistent row lengths — showing the original
            </span>
          )}
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label={showTable ? 'Show the original text' : 'Show as a table'}
            onClick={() => setTableRequested((v) => !v)}
          >
            {showTable ? 'Raw' : 'Table'}
          </ToolbarButton>
          {!showTable && (
            <ToolbarButton label={wrap ? 'Disable wrapping' : 'Enable wrapping'} onClick={() => setWrap((w) => !w)}>
              {wrap ? 'No wrap' : 'Wrap'}
            </ToolbarButton>
          )}
        </ToolbarGroup>
      </Toolbar>
      <div className="dp-csv__scroll">
        {showTable ? (
          <table className="dp-csv__table">
            <thead>
              <tr>
                {parsed.rows[0].map((cell, i) => (
                  <th key={i}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(1).map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className={wrap ? 'dp-text__pre dp-text__pre--wrap' : 'dp-text__pre'}>
            <code>{raw}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
