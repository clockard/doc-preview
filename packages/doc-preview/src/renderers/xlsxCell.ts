import { dateToSerial, format as formatNumber, isDateFormat } from 'numfmt'
import type { Cell } from 'exceljs'

/** Spreadsheet column index (1-based) to its letter, e.g. 28 -> AB. */
export function columnLetter(index: number): string {
  let result = ''
  let n = index
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

/**
 * Render a cell the way Excel would display it.
 *
 * ExcelJS reports the number format string but never applies it, so reading
 * `cell.value` directly surfaces raw date serials and unrounded floats. Running
 * the value through numfmt with `cell.numFmt` is what makes dates, currency and
 * percentages look like the source spreadsheet.
 */
export function formatCellValue(cell: Cell): string {
  const value = unwrap(cell.value)
  if (value === null || value === undefined) return ''

  const pattern = cell.numFmt

  if (value instanceof Date) {
    // numfmt works in serials; General on a date still needs a date pattern.
    const serial = toExcelSerial(value)
    if (serial === null) return value.toISOString().slice(0, 10)
    const datePattern = pattern && isDateFormat(pattern) ? pattern : 'yyyy-mm-dd'
    return safeFormat(datePattern, serial, () => value.toISOString().slice(0, 10))
  }

  if (typeof value === 'number') {
    if (!pattern || pattern === 'General') return String(value)
    return safeFormat(pattern, value, () => String(value))
  }

  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'

  return String(value)
}

/**
 * Convert an ExcelJS date to a spreadsheet serial using UTC components.
 *
 * Spreadsheet dates carry no timezone, and ExcelJS materialises them at UTC
 * midnight. Passing such a Date to `dateToSerial` directly reads its *local*
 * components, so every date renders a day early for anyone west of UTC —
 * silently, and only for them. Reading the UTC parts keeps the displayed date
 * equal to the one stored in the file, in every timezone.
 */
function toExcelSerial(date: Date): number | null {
  return dateToSerial([
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ])
}

function safeFormat(pattern: string, value: number, fallback: () => string): string {
  try {
    return formatNumber(pattern, value)
  } catch {
    // Excel accepts format strings numfmt rejects; showing the raw value beats
    // blanking the cell.
    return fallback()
  }
}

/** Flatten the tagged union ExcelJS uses for cell values. */
function unwrap(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value

  const record = value as Record<string, unknown>
  // Formula cells: show the cached result, not the formula text.
  if ('result' in record) return unwrap(record.result)
  if ('richText' in record) {
    const runs = record.richText as { text: string }[]
    return runs.map((run) => run.text).join('')
  }
  if ('text' in record) return record.text
  if ('error' in record) return record.error
  return String(value)
}

export function argbToCss(argb?: string): string | undefined {
  if (!argb) return undefined
  // ExcelJS uses AARRGGBB; CSS wants #RRGGBBAA.
  if (argb.length === 8) {
    const alpha = argb.slice(0, 2)
    const rgb = argb.slice(2)
    return alpha.toLowerCase() === 'ff' ? `#${rgb}` : `#${rgb}${alpha}`
  }
  if (argb.length === 6) return `#${argb}`
  return undefined
}

export interface CellSpan {
  rowSpan: number
  colSpan: number
}

export interface MergeMap {
  /** Keyed "row:col" — the cell that owns a merged range. */
  spans: Map<string, CellSpan>
  /** Keyed "row:col" — cells swallowed by a range, which must not be drawn. */
  covered: Set<string>
}

/**
 * Invert a sheet's merged ranges into per-cell lookups.
 *
 * Skipping this does not merely lose the span: ExcelJS returns the *same value*
 * for every cell inside a merged range, so a title merged across five columns
 * renders five times over unless the covered cells are dropped.
 */
export function mergeMap(sheet: { model: unknown }): MergeMap {
  const spans = new Map<string, CellSpan>()
  const covered = new Set<string>()
  const merges = (sheet.model as { merges?: string[] }).merges ?? []

  for (const range of merges) {
    const [start, end] = range.split(':')
    if (!start || !end) continue
    const from = parseRef(start)
    const to = parseRef(end)
    if (!from || !to) continue
    spans.set(`${from.row}:${from.col}`, {
      rowSpan: to.row - from.row + 1,
      colSpan: to.col - from.col + 1,
    })
    for (let r = from.row; r <= to.row; r += 1) {
      for (let c = from.col; c <= to.col; c += 1) {
        if (r !== from.row || c !== from.col) covered.add(`${r}:${c}`)
      }
    }
  }
  return { spans, covered }
}

/** Parse an A1-style reference into 1-based row and column numbers. */
export function parseRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, ''))
  if (!match) return null
  let col = 0
  for (const char of match[1]) col = col * 26 + (char.charCodeAt(0) - 64)
  return { row: Number(match[2]), col }
}
