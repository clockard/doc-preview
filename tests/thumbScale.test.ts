import { describe, expect, it } from 'vitest'
import { computeScale } from '../packages/doc-preview/src/thumbnails/thumbScale'

const box = { width: 200, height: 260 }

describe('computeScale', () => {
  it('covers by the larger ratio so no gap is left', () => {
    // A landscape slide in a portrait tile has to be driven by height.
    const scale = computeScale({ width: 960, height: 540 }, box, 'cover')
    expect(scale).toBeCloseTo(260 / 540)
    expect(960 * scale).toBeGreaterThanOrEqual(box.width)
    expect(540 * scale).toBeCloseTo(box.height)
  })

  it('contains by the smaller ratio so nothing is cropped', () => {
    const scale = computeScale({ width: 960, height: 540 }, box, 'contain')
    expect(scale).toBeCloseTo(200 / 960)
    expect(960 * scale).toBeCloseTo(box.width)
    expect(540 * scale).toBeLessThanOrEqual(box.height)
  })

  it('fills a portrait page in either mode without exceeding the tile under contain', () => {
    const page = { width: 794, height: 1123 }
    expect(794 * computeScale(page, box, 'cover')).toBeGreaterThanOrEqual(box.width)
    expect(1123 * computeScale(page, box, 'contain')).toBeLessThanOrEqual(box.height + 0.001)
  })

  it('scales a square to the tile it is given', () => {
    expect(computeScale({ width: 100, height: 100 }, { width: 50, height: 50 }, 'cover')).toBe(0.5)
    expect(computeScale({ width: 100, height: 100 }, { width: 50, height: 50 }, 'contain')).toBe(0.5)
  })

  it('scales small content up by default, so a page fills its tile', () => {
    expect(computeScale({ width: 16, height: 16 }, box, 'contain')).toBeGreaterThan(1)
  })

  it('never enlarges past natural size when upscaling is refused', () => {
    // A 16px icon blown across a 200px tile looks broken, not previewed.
    expect(computeScale({ width: 16, height: 16 }, box, 'contain', { allowUpscale: false })).toBe(1)
    expect(computeScale({ width: 16, height: 16 }, box, 'cover', { allowUpscale: false })).toBe(1)
  })

  it('returns 0 rather than Infinity or NaN for a degenerate box or content', () => {
    expect(computeScale({ width: 0, height: 0 }, box, 'cover')).toBe(0)
    expect(computeScale({ width: 100, height: 100 }, { width: 0, height: 0 }, 'cover')).toBe(0)
    expect(computeScale({ width: 100, height: -5 }, box, 'contain')).toBe(0)
  })
})
