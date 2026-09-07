/**
 * Minimal uncompressed RGB TIFF encoder, used only to generate a fixture.
 *
 * Its purpose is to exercise the image renderer's *failure* path: TIFF is a
 * real image format that only Safari decodes, so on other browsers it is the
 * cleanest way to test that an undecodable file reports itself clearly and
 * offers a download rather than showing an empty pane.
 */

const SHORT = 3
const LONG = 4

/**
 * @param width  image width in pixels
 * @param height image height in pixels
 * @param paint  (x, y) => [r, g, b], each 0-255
 */
export function encodeTiff(width, height, paint) {
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y)
      const at = (y * width + x) * 3
      pixels[at] = r
      pixels[at + 1] = g
      pixels[at + 2] = b
    }
  }

  // Tags must appear in ascending order; readers rely on it.
  const entries = [
    [256, LONG, 1, width], //          ImageWidth
    [257, LONG, 1, height], //         ImageLength
    [258, SHORT, 3, null], //          BitsPerSample -> out-of-line [8,8,8]
    [259, SHORT, 1, 1], //             Compression: none
    [262, SHORT, 1, 2], //             PhotometricInterpretation: RGB
    [273, LONG, 1, null], //           StripOffsets -> pixel data
    [277, SHORT, 1, 3], //             SamplesPerPixel
    [278, LONG, 1, height], //         RowsPerStrip: the whole image
    [279, LONG, 1, pixels.length], //  StripByteCounts
  ]

  const ifdOffset = 8
  const ifdSize = 2 + entries.length * 12 + 4
  const bitsOffset = ifdOffset + ifdSize
  const dataOffset = bitsOffset + 6

  const header = Buffer.alloc(8)
  header.write('II', 0, 'latin1') // little-endian
  header.writeUInt16LE(42, 2) // the magic number that makes it a TIFF
  header.writeUInt32LE(ifdOffset, 4)

  const ifd = Buffer.alloc(ifdSize)
  ifd.writeUInt16LE(entries.length, 0)
  entries.forEach(([tag, type, count, value], index) => {
    const at = 2 + index * 12
    ifd.writeUInt16LE(tag, at)
    ifd.writeUInt16LE(type, at + 2)
    ifd.writeUInt32LE(count, at + 4)
    // Values wider than four bytes are stored elsewhere and referenced by offset.
    if (tag === 258) ifd.writeUInt32LE(bitsOffset, at + 8)
    else if (tag === 273) ifd.writeUInt32LE(dataOffset, at + 8)
    else if (type === SHORT) ifd.writeUInt16LE(value, at + 8)
    else ifd.writeUInt32LE(value, at + 8)
  })
  ifd.writeUInt32LE(0, ifdSize - 4) // no further IFDs

  const bitsPerSample = Buffer.alloc(6)
  bitsPerSample.writeUInt16LE(8, 0)
  bitsPerSample.writeUInt16LE(8, 2)
  bitsPerSample.writeUInt16LE(8, 4)

  return Buffer.concat([header, ifd, bitsPerSample, pixels])
}
