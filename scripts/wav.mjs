/**
 * Minimal uncompressed PCM WAV encoder, used only to generate a fixture.
 *
 * Same reasoning as png.mjs and tiff.mjs: a raw PCM WAV header is a few dozen
 * bytes, so writing it by hand keeps the fixture script dependency-free and
 * the output reviewable.
 */

/**
 * @param seconds duration in seconds
 * @param sampleRate samples per second
 * @param synth (t) => sample in [-1, 1]
 */
export function encodeWav(seconds, sampleRate, synth) {
  const sampleCount = Math.round(seconds * sampleRate)
  const dataSize = sampleCount * 2 // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')

  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate (sampleRate * blockAlign)
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample

  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate
    const sample = Math.max(-1, Math.min(1, synth(t)))
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }

  return buffer
}
