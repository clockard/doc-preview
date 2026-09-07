import { describe, expect, it } from 'vitest'
import { fixture } from './helpers'

/** Strip tags and decode the entities pptxtojson emits (it uses &nbsp; for spaces). */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

/**
 * These run the real parsers against the real fixtures. They are the guard
 * against a dependency upgrade quietly changing an output shape the renderers
 * depend on — the kind of break that otherwise only shows up in the browser.
 */

describe('pptxtojson', () => {
  it('parses the deck into positioned elements', async () => {
    const { parse } = await import('pptxtojson')
    const deck = await parse(await fixture('sample.pptx'), {
      imageMode: 'base64',
      videoMode: 'none',
      audioMode: 'none',
    })

    expect(deck.slides).toHaveLength(3)
    expect(deck.size.width).toBeGreaterThan(0)
    expect(deck.size.height).toBeGreaterThan(0)

    const [first] = deck.slides
    expect(first.fill).toMatchObject({ type: 'color', value: '#1E3A8A' })

    const title = first.elements[0]
    expect(title.type).toBe('shape')
    // The renderer positions elements straight from these values.
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      expect(typeof title[key]).toBe('number')
    }
    expect(plainText(('content' in title && title.content) || '')).toBe('doc-preview PowerPoint fixture')

    // Notes arrive as HTML, which is why the renderer sanitises them.
    expect(plainText(first.note)).toContain('Opening slide')
  })

  it('parses a table into rows of cells', async () => {
    const { parse } = await import('pptxtojson')
    const deck = await parse(await fixture('sample.pptx'), { imageMode: 'none' })
    const table = deck.slides[2].elements.find((el) => el.type === 'table')
    expect(table).toBeDefined()
    if (table?.type !== 'table') throw new Error('expected a table')
    expect(table.data).toHaveLength(4)
    expect(table.data[0].map((cell) => plainText(cell.text))).toEqual(['Format', 'Library', 'Fidelity'])
  })
})

describe('exceljs', () => {
  it('loads every sheet with its merges and formats intact', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await fixture('sample.xlsx'))

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Q3 Summary', 'Notes', 'Large'])

    const summary = workbook.worksheets[0]
    expect((summary.model as { merges?: string[] }).merges).toContain('A1:E1')
    expect(summary.getCell('C3').numFmt).toBe('$#,##0.00')
    expect(summary.getCell('B3').value).toBeInstanceOf(Date)

    // The virtualisation path only matters if a sheet actually exceeds the threshold.
    expect(workbook.worksheets[2].rowCount).toBeGreaterThan(500)
  })
})

describe('docx-preview fixture', () => {
  it('contains the parts docx-preview needs', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await fixture('sample.docx'))
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) {
      expect(zip.file(part), `missing ${part}`).not.toBeNull()
    }
    const document = await zip.file('word/document.xml')!.async('string')
    expect(document).toContain('doc-preview Word fixture')
  })
})

describe('pdfjs-dist', () => {
  it('opens the PDF and exposes its text layer content', async () => {
    // The legacy build runs under Node; the browser bundle is what ships.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: new Uint8Array(await fixture('sample.pdf')) })
    const doc = await task.promise

    expect(doc.numPages).toBe(2)
    const page = await doc.getPage(1)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    expect(text).toContain('doc-preview PDF fixture')
    await task.destroy()
  })
})
