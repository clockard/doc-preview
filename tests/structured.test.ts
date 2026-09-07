import { describe, expect, it } from 'vitest'
import { formatJson } from '../packages/doc-preview/src/format/json'
import { formatXml } from '../packages/doc-preview/src/format/xml'
import { tokenizeJson, tokenizeXml } from '../packages/doc-preview/src/format/highlight'

describe('formatJson', () => {
  it('indents compact JSON', () => {
    expect(formatJson('{"a":1,"b":[2,3]}').text).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    )
  })

  it('preserves value types and escapes', () => {
    const result = formatJson('{"s":"say \\"hi\\"","n":-2.5,"e":3e4,"t":true,"z":null}')
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.text)).toEqual({ s: 'say "hi"', n: -2.5, e: 30000, t: true, z: null })
  })

  it('returns the original text and an error for malformed input', () => {
    const broken = '{"a": 1,}'
    const result = formatJson(broken)
    expect(result.text).toBe(broken)
    expect(result.error).toBeTruthy()
  })

  it('formats newline-delimited JSON, which log pipelines emit', () => {
    const result = formatJson('{"a":1}\n{"a":2}\n')
    expect(result.error).toBeUndefined()
    expect(result.text).toBe('{\n  "a": 1\n}\n{\n  "a": 2\n}')
  })

  it('leaves an empty document alone', () => {
    expect(formatJson('   ').error).toBeUndefined()
  })
})

describe('formatXml', () => {
  it('indents nested elements', () => {
    expect(formatXml('<a><b><c>x</c></b></a>').text).toBe('<a>\n  <b>\n    <c>x</c>\n  </b>\n</a>')
  })

  it('keeps the XML declaration, which DOMParser drops', () => {
    const result = formatXml('<?xml version="1.0" encoding="UTF-8"?><a><b>1</b></a>')
    expect(result.text.split('\n')[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>')
  })

  it('collapses empty elements and preserves attributes', () => {
    expect(formatXml('<r><e a="1" b="two"></e></r>').text).toBe('<r>\n  <e a="1" b="two"/>\n</r>')
  })

  /**
   * Indenting children rewrites inter-element whitespace, which is significant
   * in mixed content. Such elements stay on one line so prose is not corrupted.
   */
  it('does not reflow mixed content', () => {
    expect(formatXml('<p>text <b>bold</b> more</p>').text).toBe('<p>text <b>bold</b> more</p>')
  })

  it('round-trips escaping and CDATA without double-escaping', () => {
    const result = formatXml('<r><t>a &amp; b &lt;c&gt;</t><![CDATA[raw <x> & y]]></r>')
    expect(result.text).toContain('a &amp; b &lt;c&gt;')
    expect(result.text).toContain('<![CDATA[raw <x> & y]]>')
    expect(result.text).not.toContain('&amp;amp;')
  })

  it('preserves comments', () => {
    expect(formatXml('<r><!-- note --><a/></r>').text).toContain('<!-- note -->')
  })

  it('reports malformed XML and returns the original', () => {
    const broken = '<a><b></a>'
    const result = formatXml(broken)
    expect(result.text).toBe(broken)
    expect(result.error).toBeTruthy()
  })
})

describe('tokenizers', () => {
  /** Round-tripping guarantees highlighting never drops or duplicates content. */
  const joined = (tokens: { value: string }[]) => tokens.map((t) => t.value).join('')

  it('json tokens reconstruct the source exactly', () => {
    const text = formatJson('{"a":1,"b":"x","c":true,"d":null,"e":[-1.5]}').text
    expect(joined(tokenizeJson(text))).toBe(text)
  })

  it('distinguishes keys from string values', () => {
    const tokens = tokenizeJson('{\n  "key": "value"\n}')
    expect(tokens.find((t) => t.type === 'key')?.value).toBe('"key"')
    expect(tokens.find((t) => t.type === 'string')?.value).toBe('"value"')
  })

  it('xml tokens reconstruct the source exactly', () => {
    const text = formatXml('<?xml version="1.0"?><r a="1"><!-- c --><b>x</b><![CDATA[y]]></r>').text
    expect(joined(tokenizeXml(text))).toBe(text)
  })

  it('picks out tag and attribute names', () => {
    const tokens = tokenizeXml('<doc id="7">x</doc>')
    expect(tokens.filter((t) => t.type === 'tag').map((t) => t.value)).toEqual(['doc', 'doc'])
    expect(tokens.find((t) => t.type === 'attr')?.value).toBe('id')
    expect(tokens.find((t) => t.type === 'value')?.value).toBe('"7"')
  })

  it('does not emit markup for content that looks like markup', () => {
    // Values reach the DOM as text children, so this only has to stay intact.
    const text = '{\n  "html": "<script>alert(1)</script>"\n}'
    expect(joined(tokenizeJson(text))).toBe(text)
  })
})
