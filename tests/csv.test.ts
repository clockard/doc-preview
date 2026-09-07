import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from '../packages/doc-preview/src/format/csv'

describe('detectDelimiter', () => {
  it('picks comma when the first line has more commas than tabs', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
  })

  it('picks tab when the first line has more tabs than commas', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
  })

  it('defaults to comma for a single-column file', () => {
    expect(detectDelimiter('a\n1\n2')).toBe(',')
  })
})

describe('parseCsv', () => {
  it('splits a simple grid', () => {
    const result = parseCsv('a,b,c\n1,2,3\n4,5,6', ',')
    expect(result.rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
    expect(result.ragged).toBe(false)
  })

  it('honours quoted fields containing the delimiter', () => {
    const result = parseCsv('name,note\n"Smith, John",ok', ',')
    expect(result.rows[1]).toEqual(['Smith, John', 'ok'])
  })

  it('honours a quoted field containing a newline', () => {
    const result = parseCsv('a,b\n"line one\nline two",x', ',')
    expect(result.rows[1]).toEqual(['line one\nline two', 'x'])
  })

  it('unescapes doubled quotes inside a quoted field', () => {
    const result = parseCsv('a\n"she said ""hi"""', ',')
    expect(result.rows[1]).toEqual(['she said "hi"'])
  })

  it('tolerates a trailing newline without adding an empty row', () => {
    const result = parseCsv('a,b\n1,2\n', ',')
    expect(result.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips carriage returns from CRLF line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r\n', ',')
    expect(result.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('parses tab-delimited input', () => {
    const result = parseCsv('a\tb\n1\t2', '\t')
    expect(result.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('flags ragged rows so a misleading table is never drawn', () => {
    const result = parseCsv('a,b,c\n1,2\n3,4,5,6', ',')
    expect(result.ragged).toBe(true)
  })

  it('flags an empty document as ragged rather than a zero-column table', () => {
    expect(parseCsv('', ',').ragged).toBe(true)
  })
})
