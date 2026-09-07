export type TokenType =
  | 'plain'
  | 'key'
  | 'string'
  | 'number'
  | 'literal'
  | 'punct'
  | 'tag'
  | 'attr'
  | 'value'
  | 'comment'
  | 'cdata'

export interface Token {
  type: TokenType
  value: string
}

/**
 * Above this size, highlighting is skipped and the text renders unstyled.
 * Tokenising a multi-megabyte document costs more than the colour is worth, and
 * the resulting element count is what actually janks the browser.
 */
export const HIGHLIGHT_LIMIT = 2 * 1024 * 1024

/*
 * These produce token lists rather than HTML strings on purpose: the renderer
 * turns them into React elements, so document content can never be interpreted
 * as markup no matter what it contains.
 */

const JSON_TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g

export function tokenizeJson(text: string): Token[] {
  const tokens: Token[] = []
  let last = 0

  for (const match of text.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ type: 'plain', value: text.slice(last, index) })

    const [, keyName, colon, stringValue, numberValue, literal] = match
    if (keyName !== undefined) {
      tokens.push({ type: 'key', value: keyName })
      tokens.push({ type: 'punct', value: colon })
    } else if (stringValue !== undefined) {
      tokens.push({ type: 'string', value: stringValue })
    } else if (numberValue !== undefined) {
      tokens.push({ type: 'number', value: numberValue })
    } else if (literal !== undefined) {
      tokens.push({ type: 'literal', value: literal })
    }
    last = index + match[0].length
  }

  if (last < text.length) tokens.push({ type: 'plain', value: text.slice(last) })
  return tokens
}

const XML_CHUNK = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][\s\S]*?>|<\/?[^>]*>/g
const XML_ATTR = /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g

export function tokenizeXml(text: string): Token[] {
  const tokens: Token[] = []
  let last = 0

  for (const match of text.matchAll(XML_CHUNK)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ type: 'plain', value: text.slice(last, index) })

    const chunk = match[0]
    if (chunk.startsWith('<!--')) tokens.push({ type: 'comment', value: chunk })
    else if (chunk.startsWith('<![CDATA[')) tokens.push({ type: 'cdata', value: chunk })
    else if (chunk.startsWith('<?') || chunk.startsWith('<!')) tokens.push({ type: 'comment', value: chunk })
    else tokens.push(...tokenizeTag(chunk))

    last = index + chunk.length
  }

  if (last < text.length) tokens.push({ type: 'plain', value: text.slice(last) })
  return tokens
}

function tokenizeTag(chunk: string): Token[] {
  const nameMatch = /^<\/?\s*([\w:.-]+)/.exec(chunk)
  if (!nameMatch) return [{ type: 'punct', value: chunk }]

  const tokens: Token[] = []
  const nameEnd = nameMatch[0].length
  tokens.push({ type: 'punct', value: chunk.slice(0, nameEnd - nameMatch[1].length) })
  tokens.push({ type: 'tag', value: nameMatch[1] })

  const rest = chunk.slice(nameEnd)
  let last = 0
  for (const attr of rest.matchAll(XML_ATTR)) {
    const index = attr.index ?? 0
    if (index > last) tokens.push({ type: 'punct', value: rest.slice(last, index) })
    tokens.push({ type: 'attr', value: attr[1] })
    tokens.push({ type: 'punct', value: attr[2] })
    tokens.push({ type: 'value', value: attr[3] })
    last = index + attr[0].length
  }
  if (last < rest.length) tokens.push({ type: 'punct', value: rest.slice(last) })

  return tokens
}
