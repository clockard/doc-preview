import { describe, expect, it } from 'vitest'
import { decodeText } from '../packages/doc-preview/src/decodeText'

const withPrefix = (prefix: number[], body: Uint8Array) =>
  new Uint8Array([...prefix, ...body]).buffer

describe('decodeText', () => {
  it('decodes plain UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('hello ünïcode').buffer)).toBe('hello ünïcode')
  })

  it('strips a UTF-8 BOM', () => {
    const data = withPrefix([0xef, 0xbb, 0xbf], new TextEncoder().encode('hello'))
    expect(decodeText(data)).toBe('hello')
  })

  it('decodes UTF-16 LE with a BOM', () => {
    const body = new Uint8Array([0x68, 0x00, 0x69, 0x00]) // "hi"
    expect(decodeText(withPrefix([0xff, 0xfe], body))).toBe('hi')
  })

  it('decodes UTF-16 BE with a BOM', () => {
    const body = new Uint8Array([0x00, 0x68, 0x00, 0x69])
    expect(decodeText(withPrefix([0xfe, 0xff], body))).toBe('hi')
  })

  it('handles an empty buffer', () => {
    expect(decodeText(new ArrayBuffer(0))).toBe('')
  })
})
