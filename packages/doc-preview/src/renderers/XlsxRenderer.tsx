import { useEffect, useMemo, useRef, useState } from 'react'
import type { Workbook, Worksheet } from 'exceljs'
import type { RendererProps } from '../types'
import { Spinner } from '../chrome/Spinner'
import { argbToCss, columnLetter, formatCellValue, mergeMap } from './xlsxCell'
import type { CellSpan } from './xlsxCell'

/** Above this row count the sheet is windowed rather than rendered whole. */
const VIRTUALISE_ABOVE = 500
const ROW_HEIGHT = 24
const OVERSCAN = 20

export function XlsxRenderer({ data, onError }: RendererProps) {
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ExcelJS = await import('exceljs')
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(data)
        if (!cancelled) setWorkbook(wb)
      } catch (err) {
        if (!cancelled) onError?.(err as Error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data, onError])

  const sheets = useMemo(
    () => (workbook ? workbook.worksheets.filter((sheet) => sheet.state !== 'veryHidden') : []),
    [workbook],
  )

  if (!workbook) return <Spinner label="Opening workbook…" />
  if (sheets.length === 0) return <div className="dp-centred"><p className="dp-centred__label">This workbook has no visible sheets.</p></div>

  const active = sheets[Math.min(activeIndex, sheets.length - 1)]

  return (
    <div className="dp-xlsx">
      <SheetGrid key={active.id} sheet={active} />
      {sheets.length > 1 && (
        <div className="dp-xlsx__tabs" role="tablist">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'dp-xlsx__tab dp-xlsx__tab--active' : 'dp-xlsx__tab'}
              onClick={() => setActiveIndex(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SheetGrid({ sheet }: { sheet: Worksheet }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  const rowCount = Math.max(sheet.rowCount, 1)
  const columnCount = Math.max(sheet.columnCount, 1)
  const virtualised = rowCount > VIRTUALISE_ABOVE

  /**
   * Merged ranges are declared once on the sheet, but rendering needs the
   * inverse: which cell owns a span, and which cells are covered by one and so
   * must not emit a <td> at all.
   */
  const { spans, covered } = useMemo(() => mergeMap(sheet), [sheet])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const update = () => setViewportHeight(node.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const firstRow = virtualised ? Math.max(1, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 1
  const visibleCount = virtualised
    ? Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
    : rowCount
  const lastRow = Math.min(rowCount, firstRow + visibleCount)

  const rows: number[] = []
  for (let r = firstRow; r <= lastRow; r += 1) rows.push(r)

  return (
    <div
      className="dp-xlsx__scroll"
      ref={scrollRef}
      onScroll={virtualised ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
    >
      <table className="dp-xlsx__table" style={{ width: 'max-content' }}>
        <colgroup>
          <col style={{ width: 48 }} />
          {Array.from({ length: columnCount }, (_, i) => (
            <col key={i} style={{ width: columnWidthPx(sheet, i + 1) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="dp-xlsx__corner" />
            {Array.from({ length: columnCount }, (_, i) => (
              <th key={i} className="dp-xlsx__head">
                {columnLetter(i + 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {virtualised && firstRow > 1 && (
            <tr style={{ height: (firstRow - 1) * ROW_HEIGHT }} aria-hidden="true">
              <td colSpan={columnCount + 1} />
            </tr>
          )}
          {rows.map((rowNumber) => (
            <SheetRow
              key={rowNumber}
              sheet={sheet}
              rowNumber={rowNumber}
              columnCount={columnCount}
              spans={spans}
              covered={covered}
            />
          ))}
          {virtualised && lastRow < rowCount && (
            <tr style={{ height: (rowCount - lastRow) * ROW_HEIGHT }} aria-hidden="true">
              <td colSpan={columnCount + 1} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

interface SheetRowProps {
  sheet: Worksheet
  rowNumber: number
  columnCount: number
  spans: Map<string, CellSpan>
  covered: Set<string>
}

function SheetRow({ sheet, rowNumber, columnCount, spans, covered }: SheetRowProps) {
  const row = sheet.getRow(rowNumber)
  const cells = []

  for (let col = 1; col <= columnCount; col += 1) {
    const key = `${rowNumber}:${col}`
    if (covered.has(key)) continue

    const cell = row.getCell(col)
    const span = spans.get(key)
    const style: React.CSSProperties = {}

    const font = cell.font
    if (font?.bold) style.fontWeight = 600
    if (font?.italic) style.fontStyle = 'italic'
    if (font?.underline) style.textDecoration = 'underline'
    if (font?.size) style.fontSize = `${font.size}px`
    const fontColor = argbToCss((font?.color as { argb?: string } | undefined)?.argb)
    if (fontColor) style.color = fontColor

    const fill = cell.fill
    if (fill?.type === 'pattern' && fill.pattern === 'solid') {
      const bg = argbToCss((fill.fgColor as { argb?: string } | undefined)?.argb)
      if (bg) style.backgroundColor = bg
    }

    const alignment = cell.alignment
    if (alignment?.horizontal) style.textAlign = alignment.horizontal as React.CSSProperties['textAlign']
    if (alignment?.vertical) {
      style.verticalAlign = alignment.vertical === 'middle' ? 'middle' : alignment.vertical
    }
    if (alignment?.wrapText) style.whiteSpace = 'pre-wrap'

    // Numbers right-align by default, matching spreadsheet convention.
    if (!alignment?.horizontal && typeof cell.value === 'number') style.textAlign = 'right'

    cells.push(
      <td
        key={col}
        className="dp-xlsx__cell"
        style={style}
        rowSpan={span?.rowSpan}
        colSpan={span?.colSpan}
      >
        {formatCellValue(cell)}
      </td>,
    )
  }

  return (
    <tr style={{ height: row.height ? `${row.height * 1.33}px` : undefined }}>
      <th className="dp-xlsx__rownum">{rowNumber}</th>
      {cells}
    </tr>
  )
}

function columnWidthPx(sheet: Worksheet, index: number): number {
  const width = sheet.getColumn(index)?.width
  // Excel widths are in character units; ~7px per character is the usual approximation.
  return width ? Math.round(width * 7) : 80
}
