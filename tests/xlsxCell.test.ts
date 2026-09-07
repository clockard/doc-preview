import { describe, expect, it } from 'vitest'
import { columnLetter, formatCellValue, mergeMap } from '../packages/doc-preview/src/renderers/xlsxCell'
import type { Cell } from 'exceljs'

/** Only the fields formatCellValue reads. */
const cell = (value: unknown, numFmt?: string) => ({ value, numFmt }) as unknown as Cell

describe('columnLetter', () => {
  it.each([
    [1, 'A'],
    [26, 'Z'],
    [27, 'AA'],
    [28, 'AB'],
    [52, 'AZ'],
    [53, 'BA'],
    [702, 'ZZ'],
    [703, 'AAA'],
  ])('maps column %i to %s', (index, expected) => {
    expect(columnLetter(index)).toBe(expected)
  })
})

describe('formatCellValue', () => {
  it('applies currency, percent and thousands formats', () => {
    expect(formatCellValue(cell(128400.5, '$#,##0.00'))).toBe('$128,400.50')
    expect(formatCellValue(cell(0.412, '0.0%'))).toBe('41.2%')
    expect(formatCellValue(cell(1820, '#,##0'))).toBe('1,820')
  })

  it('leaves General numbers alone', () => {
    expect(formatCellValue(cell(42.5, 'General'))).toBe('42.5')
    expect(formatCellValue(cell(42.5))).toBe('42.5')
  })

  /**
   * Regression: spreadsheet dates are timezone-less and ExcelJS materialises
   * them at UTC midnight. Reading local components shifted every date a day
   * earlier for anyone west of UTC. Pin the process to such a zone so the bug
   * cannot come back unnoticed on a UTC CI box.
   */
  it('formats dates from UTC components regardless of local timezone', () => {
    const original = process.env.TZ
    try {
      for (const tz of ['America/Denver', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
        process.env.TZ = tz
        expect(formatCellValue(cell(new Date('2026-07-14T00:00:00Z'), 'dd mmm yyyy'))).toBe('14 Jul 2026')
      }
    } finally {
      process.env.TZ = original
    }
  })

  it('falls back to an ISO date when no date format is given', () => {
    expect(formatCellValue(cell(new Date('2026-03-01T00:00:00Z')))).toBe('2026-03-01')
  })

  it('shows the cached result of a formula, not the formula text', () => {
    expect(formatCellValue(cell({ formula: 'SUM(C2:C6)', result: 580386.6 }, '$#,##0.00'))).toBe('$580,386.60')
  })

  it('flattens rich text and hyperlink cells', () => {
    expect(formatCellValue(cell({ richText: [{ text: 'Hello ' }, { text: 'world' }] }))).toBe('Hello world')
    expect(formatCellValue(cell({ hyperlink: 'https://example.com', text: 'Example' }))).toBe('Example')
  })

  it('renders empty and boolean cells', () => {
    expect(formatCellValue(cell(null))).toBe('')
    expect(formatCellValue(cell(undefined))).toBe('')
    expect(formatCellValue(cell(true))).toBe('TRUE')
    expect(formatCellValue(cell(false))).toBe('FALSE')
  })

  it('shows the raw value when the format string is not understood', () => {
    expect(formatCellValue(cell(7, '[Nonsense]@@@'))).toBe('7')
  })
})

describe('mergeMap', () => {
  const sheet = (merges: string[]) => ({ model: { merges } })

  it('marks the owner and every cell a range swallows', () => {
    // A1:E1 — a title merged across five columns.
    const { spans, covered } = mergeMap(sheet(['A1:E1']))
    expect(spans.get('1:1')).toEqual({ rowSpan: 1, colSpan: 5 })
    // Without these the same title value renders five times over.
    expect([...covered]).toEqual(['1:2', '1:3', '1:4', '1:5'])
    expect(covered.has('1:1')).toBe(false)
  })

  it('handles a block spanning rows and columns', () => {
    const { spans, covered } = mergeMap(sheet(['B2:C3']))
    expect(spans.get('2:2')).toEqual({ rowSpan: 2, colSpan: 2 })
    expect(covered.has('2:3')).toBe(true)
    expect(covered.has('3:2')).toBe(true)
    expect(covered.has('3:3')).toBe(true)
    expect(covered.size).toBe(3)
  })

  it('reads columns past Z', () => {
    expect(mergeMap(sheet(['AA1:AB1'])).spans.get('1:27')).toEqual({ rowSpan: 1, colSpan: 2 })
  })

  it('ignores absolute markers and malformed ranges', () => {
    expect(mergeMap(sheet(['$A$1:$B$1'])).spans.get('1:1')).toEqual({ rowSpan: 1, colSpan: 2 })
    expect(mergeMap(sheet(['nonsense', 'A1'])).spans.size).toBe(0)
  })

  it('is empty for a sheet with no merges', () => {
    expect(mergeMap({ model: {} }).spans.size).toBe(0)
    expect(mergeMap(sheet([])).covered.size).toBe(0)
  })
})
