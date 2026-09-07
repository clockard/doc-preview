import { describe, expect, it } from 'vitest'
import { extractPdfText, findPdfMatches } from '../packages/doc-preview/src/renderers/pdfSearch'
import { fixture } from './helpers'

describe('findPdfMatches', () => {
  const pages = new Map([
    [1, 'Page one. This text lives in the text layer.'],
    [2, 'Second page. Pages render lazily as they approach the viewport.'],
    [3, 'Nothing relevant here.'],
  ])

  it('finds a query that appears on multiple pages', () => {
    const matches = findPdfMatches(pages, 'page')
    expect(matches.map((m) => m.page)).toEqual([1, 2])
  })

  it('counts occurrences on each page', () => {
    const matches = findPdfMatches(pages, 'page')
    expect(matches.find((m) => m.page === 2)?.count).toBe(2) // "Second page" + "Pages"
  })

  it('is case-insensitive', () => {
    expect(findPdfMatches(pages, 'PAGE').map((m) => m.page)).toEqual([1, 2])
  })

  it('finds a query unique to one page', () => {
    expect(findPdfMatches(pages, 'lazily').map((m) => m.page)).toEqual([2])
  })

  it('returns nothing for a query that matches no page', () => {
    expect(findPdfMatches(pages, 'xyzzy')).toEqual([])
  })

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(findPdfMatches(pages, '')).toEqual([])
    expect(findPdfMatches(pages, '   ')).toEqual([])
  })

  it('orders results by page number regardless of Map insertion order', () => {
    const shuffled = new Map([
      [3, 'has a page'],
      [1, 'has a page'],
      [2, 'has a page'],
    ])
    expect(findPdfMatches(shuffled, 'page').map((m) => m.page)).toEqual([1, 2, 3])
  })
})

describe('extractPdfText', () => {
  it('extracts real text from every page of the PDF fixture', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: new Uint8Array(await fixture('sample.pdf')) })
    const doc = await task.promise

    const pages = await extractPdfText(doc)
    expect(pages.size).toBe(2)
    expect(pages.get(1)).toContain('doc-preview PDF fixture')
    expect(pages.get(2)).toContain('Second page')

    // The two functions compose: a real document's extracted text is
    // searchable the same way the synthetic fixture above is.
    expect(findPdfMatches(pages, 'lazily').map((m) => m.page)).toEqual([2])
    expect(findPdfMatches(pages, 'page').map((m) => m.page)).toEqual([1, 2])

    await task.destroy()
  })
})
