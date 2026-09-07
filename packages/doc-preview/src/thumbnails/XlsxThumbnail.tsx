import { useEffect, useState } from 'react'
import type { Workbook, Worksheet } from 'exceljs'
import type { ThumbnailProps } from '../types'
import { ThumbGlyph } from './ThumbGlyph'
import { argbToCss, formatCellValue, mergeMap } from '../renderers/xlsxCell'
import { ThumbStage } from './ThumbStage'

/** Enough cells to fill any reasonable tile without walking a 100k-row sheet. */
const MAX_ROWS = 40
const MAX_COLS = 20
const ROW_HEIGHT = 22

export function XlsxThumbnail({ data, meta, box, fit, onError }: ThumbnailProps) {
  const [sheet, setSheet] = useState<Worksheet | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ExcelJS = await import('exceljs')
        const wb: Workbook = new ExcelJS.Workbook()
        await wb.xlsx.load(data)
        if (cancelled) return
        const visible = wb.worksheets.filter((s) => s.state !== 'veryHidden')
        setSheet(visible[0] ?? null)
      } catch (err) {
        if (!cancelled) onError?.(err as Error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data, onError])

  // Parsing an Office file is not instant; keep the typed tile up until it is.
  if (!sheet) return <ThumbGlyph kind={meta.kind} fileName={meta.fileName} loading />

  const colCount = Math.min(Math.max(sheet.columnCount, 1), MAX_COLS)

  const widths: number[] = []
  for (let c = 1; c <= colCount; c += 1) {
    const width = sheet.getColumn(c)?.width
    widths.push(width ? Math.round(width * 7) : 80)
  }
  const gridWidth = widths.reduce((sum, w) => sum + w, 0)

  /*
   * Fit the sheet's *width*, then show as many rows as fill the tile.
   *
   * A spreadsheet has no page for `cover` to cover: scaling a fixed block to
   * fill the tile zooms a short sheet until only two columns remain, which is a
   * worse preview than the whole width at a smaller size. Never enlarged either
   * — a three-column sheet blown up to tile width looks broken, not previewed.
   */
  const scale = Math.min(1, box.width / gridWidth)
  const available = Math.max(sheet.rowCount, 1)
  const rowCount = Math.min(
    MAX_ROWS,
    available,
    Math.max(1, Math.ceil(box.height / (ROW_HEIGHT * scale))),
  )

  const natural = { width: gridWidth, height: rowCount * ROW_HEIGHT }

  // Without this a merged title repeats across every column it spans: ExcelJS
  // hands back the same value for each cell inside the range.
  const { spans, covered } = mergeMap(sheet)

  const rows = []
  for (let r = 1; r <= rowCount; r += 1) {
    const row = sheet.getRow(r)
    const cells = []
    for (let c = 1; c <= colCount; c += 1) {
      const key = `${r}:${c}`
      if (covered.has(key)) continue

      const cell = row.getCell(c)
      const span = spans.get(key)
      const style: React.CSSProperties = {}

      const font = cell.font
      if (font?.bold) style.fontWeight = 600
      if (font?.italic) style.fontStyle = 'italic'
      const fontColor = argbToCss((font?.color as { argb?: string } | undefined)?.argb)
      if (fontColor) style.color = fontColor

      const fill = cell.fill
      if (fill?.type === 'pattern' && fill.pattern === 'solid') {
        const bg = argbToCss((fill.fgColor as { argb?: string } | undefined)?.argb)
        if (bg) style.backgroundColor = bg
      }

      const alignment = cell.alignment
      if (alignment?.horizontal) {
        style.textAlign = alignment.horizontal as React.CSSProperties['textAlign']
      } else if (typeof cell.value === 'number') {
        style.textAlign = 'right'
      }

      cells.push(
        <td
          key={c}
          className="dp-thumb__cell"
          style={style}
          rowSpan={span?.rowSpan}
          // Clamp to the cells actually drawn, or a span would reach past the
          // trimmed edge of the tile and stretch the grid.
          colSpan={span ? Math.min(span.colSpan, colCount - c + 1) : undefined}
        >
          {formatCellValue(cell)}
        </td>,
      )
    }
    rows.push(
      <tr key={r} style={{ height: ROW_HEIGHT }}>
        {cells}
      </tr>,
    )
  }

  return (
    /*
     * The A/B/C and row-number gutters are deliberately left out: a tile should
     * read as the sheet's content, not as a spreadsheet application.
     */
    <ThumbStage natural={natural} box={box} fit={fit} scale={scale}>
      <table className="dp-thumb__grid">
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>{rows}</tbody>
      </table>
    </ThumbStage>
  )
}
