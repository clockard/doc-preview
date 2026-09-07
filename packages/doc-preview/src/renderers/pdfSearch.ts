import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface PdfSearchMatch {
  page: number
  /** How many times the query occurs on this page. */
  count: number
}

/**
 * Extract the plain text of every page, once, so the whole document is
 * searchable regardless of which pages happen to be rendered.
 *
 * This is the reason a custom search exists at all: pages are virtualised
 * (`PdfRenderer`'s `visible` gate), so the browser's native Ctrl+F only ever
 * sees whichever pages currently have a text layer mounted near the
 * viewport — everything else is invisible to it.
 */
export async function extractPdfText(doc: PDFDocumentProxy): Promise<Map<number, string>> {
  const pages = new Map<number, string>()
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pages.set(n, text)
  }
  return pages
}

/** Case-insensitive occurrence count of `query` on each page that has any, ordered by page. */
export function findPdfMatches(pages: Map<number, string>, query: string): PdfSearchMatch[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const matches: PdfSearchMatch[] = []
  for (const [page, text] of pages) {
    const lower = text.toLowerCase()
    let count = 0
    let from = 0
    for (;;) {
      const at = lower.indexOf(needle, from)
      if (at === -1) break
      count += 1
      from = at + needle.length
    }
    if (count > 0) matches.push({ page, count })
  }
  return matches.sort((a, b) => a.page - b.page)
}

/**
 * Locate every occurrence of `query` within a rendered page's text layer, as
 * rectangles relative to `container`'s own box — ready to position a
 * full-opacity overlay with, rather than paint a highlight *inside* the text
 * layer.
 *
 * That distinction is not cosmetic: `.dp-pdf__text` renders at `opacity: 0.2`
 * so the browser's native text-selection colour shows through only faintly
 * over the crisp canvas underneath. A highlight painted as a descendant of
 * that container — whether by wrapping matches in markup or with the CSS
 * Custom Highlight API — inherits that same dimming with no way to opt out
 * of an ancestor's opacity from inside it. Returning plain rectangles lets
 * the caller render the highlight as a sibling instead, at full strength.
 *
 * Matching is per text node, not across the whole page: PDF.js emits one
 * text node per run of text sharing a style, so a query that happens to span
 * two adjacent runs (a word split across a font change, say) will not be
 * found. This covers the common case — a whole word or phrase within one
 * run — without reimplementing text-layer's internal fragmentation.
 */
export function findPdfMatchRects(container: HTMLElement, query: string): DOMRect[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const origin = container.getBoundingClientRect()
  const rects: DOMRect[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? ''
    const lower = text.toLowerCase()
    let from = 0
    for (;;) {
      const at = lower.indexOf(needle, from)
      if (at === -1) break
      const range = new Range()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      for (const rect of range.getClientRects()) {
        rects.push(new DOMRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height))
      }
      from = at + needle.length
    }
  }
  return rects
}
