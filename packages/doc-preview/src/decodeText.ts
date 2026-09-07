/**
 * Decode bytes to a string, honouring a BOM when present.
 *
 * Files reaching a preview component come from arbitrary sources; UTF-16 with a
 * BOM is common enough from Windows tooling that decoding it as UTF-8 (which
 * yields interleaved NULs) is a visible bug rather than a corner case.
 */
export function decodeText(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)

  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2))
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2))
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }

  return new TextDecoder('utf-8').decode(bytes)
}
