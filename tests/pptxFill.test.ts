import { describe, expect, it } from 'vitest'
import { borderToStyle, fillToStyle, ptToPx, transformToStyle, vAlignToFlex } from '../packages/doc-preview/src/renderers/pptxFill'
import type { Fill } from 'pptxtojson'

describe('ptToPx', () => {
  /**
   * Regression: pptxtojson reports geometry in points (a 960x540 slide comes
   * back as 720x405) but leaves font sizes in `pt`, which the browser renders at
   * 1.333x. Text then overflowed its measured box and slide titles clipped to
   * their first word.
   */
  it('rewrites pt lengths inside style attributes', () => {
    expect(ptToPx('<span style="font-size: 40pt;">Hi</span>')).toBe(
      '<span style="font-size: 40px;">Hi</span>',
    )
  })

  it('handles fractional sizes and several lengths in one declaration', () => {
    expect(ptToPx('<p style="font-size: 10.5pt;margin: 2pt 4pt;">x</p>')).toBe(
      '<p style="font-size: 10.5px;margin: 2px 4px;">x</p>',
    )
  })

  it('leaves text content alone', () => {
    expect(ptToPx('<p style="font-size: 12pt;">Set in 12pt Calibri</p>')).toBe(
      '<p style="font-size: 12px;">Set in 12pt Calibri</p>',
    )
  })

  it('leaves markup without styles untouched', () => {
    expect(ptToPx('<p>plain</p>')).toBe('<p>plain</p>')
  })
})

describe('fillToStyle', () => {
  it('maps a solid colour', () => {
    expect(fillToStyle({ type: 'color', value: '#FF0000' } as Fill)).toEqual({
      backgroundColor: '#FF0000',
    })
  })

  it('maps a linear gradient, offsetting for the CSS angle origin', () => {
    const style = fillToStyle({
      type: 'gradient',
      value: { path: 'line', rot: 0, colors: [{ pos: '0%', color: '#000' }, { pos: '100%', color: '#fff' }] },
    } as Fill)
    expect(style.backgroundImage).toBe('linear-gradient(90deg, #000 0%, #fff 100%)')
  })

  it('returns nothing for an undefined fill', () => {
    expect(fillToStyle(undefined)).toEqual({})
  })
})

describe('transformToStyle', () => {
  it('combines rotation and both flips', () => {
    expect(transformToStyle({ rotate: 45, isFlipH: true, isFlipV: true })).toEqual({
      transform: 'rotate(45deg) scaleX(-1) scaleY(-1)',
    })
  })

  it('emits no transform when there is nothing to apply', () => {
    expect(transformToStyle({ rotate: 0, isFlipH: false, isFlipV: false })).toEqual({})
  })
})

describe('borderToStyle', () => {
  it('needs both a width and a colour', () => {
    expect(borderToStyle({ borderWidth: 2, borderColor: '#123456', borderType: 'dashed' })).toEqual({
      borderWidth: '2px',
      borderColor: '#123456',
      borderStyle: 'dashed',
    })
    expect(borderToStyle({ borderWidth: 0, borderColor: '#123456' })).toEqual({})
  })
})

describe('vAlignToFlex', () => {
  it.each([
    ['mid', 'center'],
    ['ctr', 'center'],
    ['down', 'flex-end'],
    ['b', 'flex-end'],
    [undefined, 'flex-start'],
  ])('maps %s to %s', (input, expected) => {
    expect(vAlignToFlex(input)).toBe(expected)
  })
})
