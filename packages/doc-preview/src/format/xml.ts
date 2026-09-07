import type { FormatResult } from './json'

const INDENT = '  '

/**
 * Pretty-print XML using the browser's own parser.
 *
 * Indentation of element children rewrites inter-element whitespace, which is
 * significant in mixed content (`<p>text <b>bold</b> more</p>`). Elements whose
 * children include text are therefore left on a single line, so prose-shaped
 * markup survives while data-shaped markup gets indented.
 */
export function formatXml(text: string): FormatResult {
  const trimmed = text.trim()
  if (trimmed === '') return { text }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(trimmed, 'application/xml')
  } catch (err) {
    return { text, error: (err as Error).message }
  }

  const failure = doc.querySelector('parsererror')
  if (failure) {
    return { text, error: (failure.textContent ?? 'The document is not well-formed XML.').trim() }
  }

  const lines: string[] = []
  // DOMParser drops the XML declaration, so it is carried over from the source.
  const declaration = /^<\?xml\s[^?]*\?>/.exec(trimmed)
  if (declaration) lines.push(declaration[0])

  for (const child of Array.from(doc.childNodes)) writeNode(child, 0, lines)

  return { text: lines.join('\n') }
}

function writeNode(node: Node, depth: number, lines: string[]): void {
  const pad = INDENT.repeat(depth)

  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const element = node as Element
      const open = `<${element.nodeName}${attributes(element)}`
      const children = Array.from(element.childNodes).filter(isMeaningful)

      if (children.length === 0) {
        lines.push(`${pad}${open}/>`)
        return
      }

      // A single text child, or any mixed content, stays inline.
      const hasText = children.some((child) => child.nodeType === Node.TEXT_NODE)
      if (hasText) {
        const inline = children.map(inlineNode).join('')
        lines.push(`${pad}${open}>${inline}</${element.nodeName}>`)
        return
      }

      lines.push(`${pad}${open}>`)
      for (const child of children) writeNode(child, depth + 1, lines)
      lines.push(`${pad}</${element.nodeName}>`)
      return
    }

    case Node.TEXT_NODE: {
      const value = (node.nodeValue ?? '').trim()
      if (value) lines.push(`${pad}${escapeText(value)}`)
      return
    }

    case Node.COMMENT_NODE:
      lines.push(`${pad}<!--${node.nodeValue ?? ''}-->`)
      return

    case Node.CDATA_SECTION_NODE:
      lines.push(`${pad}<![CDATA[${node.nodeValue ?? ''}]]>`)
      return

    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction
      lines.push(`${pad}<?${pi.target} ${pi.data}?>`)
      return
    }

    default:
      return
  }
}

/** Whitespace between elements is formatting, not content. */
function isMeaningful(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return true
  return (node.nodeValue ?? '').trim() !== ''
}

function inlineNode(node: Node): string {
  switch (node.nodeType) {
    case Node.TEXT_NODE:
      return escapeText((node.nodeValue ?? '').replace(/\s+/g, ' '))
    case Node.ELEMENT_NODE: {
      const element = node as Element
      const children = Array.from(element.childNodes).filter(isMeaningful)
      const open = `<${element.nodeName}${attributes(element)}`
      if (children.length === 0) return `${open}/>`
      return `${open}>${children.map(inlineNode).join('')}</${element.nodeName}>`
    }
    case Node.CDATA_SECTION_NODE:
      return `<![CDATA[${node.nodeValue ?? ''}]]>`
    case Node.COMMENT_NODE:
      return `<!--${node.nodeValue ?? ''}-->`
    default:
      return ''
  }
}

function attributes(element: Element): string {
  return Array.from(element.attributes)
    .map((attr) => ` ${attr.name}="${escapeAttribute(attr.value)}"`)
    .join('')
}

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;')
