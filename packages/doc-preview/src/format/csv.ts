export interface CsvResult {
  rows: string[][]
  /**
   * Set when row lengths disagree enough that a table would misrepresent the
   * file — a stray unescaped delimiter, say. The renderer falls back to raw
   * text rather than drawing a grid that silently drops or misaligns data.
   */
  ragged: boolean
}

/** More tabs than commas on the first line means TSV; otherwise assume CSV. */
export function detectDelimiter(text: string): string {
  const end = text.indexOf('\n')
  const firstLine = end === -1 ? text : text.slice(0, end)
  const tabs = (firstLine.match(/\t/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  return tabs > commas ? '\t' : ','
}

/**
 * Parse delimited text into rows of fields, honouring RFC 4180 quoting: a
 * quoted field may contain the delimiter, newlines, and `""` as an escaped
 * quote.
 */
export function parseCsv(text: string, delimiter: string): CsvResult {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i += 1
        }
      } else {
        field += ch
        i += 1
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
      i += 1
    } else if (ch === '\r') {
      i += 1
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
    } else {
      field += ch
      i += 1
    }
  }

  // The file may or may not end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const width = rows[0]?.length ?? 0
  const ragged = width === 0 || rows.some((r) => r.length !== width)

  return { rows, ragged }
}
