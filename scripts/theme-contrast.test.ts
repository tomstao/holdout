/**
 * The Holdout theme reaches WCAG AA for every pair of tokens the app puts
 * together (docs/design/frontend.md, "Theme"). The values are read from
 * src/themes.css, so a colour changed there is checked here.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, luminance, over, parseHex, themeColours, type Rgb } from './contrast'

const TEXT = 4.5
const OUTLINE = 3

const css = readFileSync(new URL('../src/themes.css', import.meta.url), 'utf8')
const theme = themeColours(css, 'holdout')

function colour(name: string): Rgb {
  const value = theme.get(name)
  if (!value) throw new Error(`The holdout theme has no --color-${name}`)
  return value
}

/** Surfaces that hold body text. */
const SURFACES = ['background', 'card', 'popover', 'muted', 'secondary', 'accent', 'shell']
/** Colours used as a fill under their own `-foreground` and as text on a surface. */
const SIGNALS = ['primary', 'destructive', 'success', 'warning', 'info']

describe('contrast maths', () => {
  it('reads hex colours', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('#1D1a16')).toEqual([29, 26, 22])
    expect(() => parseHex('rgb(0,0,0)')).toThrow('Not a hex colour')
  })

  it('gives the ratios WCAG gives', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6)
    expect(luminance([0, 0, 0])).toBe(0)
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6)
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6)
    // #767676 on white is the well-known 4.54:1.
    expect(contrast(parseHex('#767676'), [255, 255, 255])).toBeCloseTo(4.54, 2)
  })

  it('paints a see-through colour over another', () => {
    expect(over([0, 0, 0], 0.5, [255, 255, 255])).toEqual([128, 128, 128])
    expect(over([10, 20, 30], 1, [255, 255, 255])).toEqual([10, 20, 30])
    expect(over([10, 20, 30], 0, [200, 100, 50])).toEqual([200, 100, 50])
  })

  it('reads one theme block and no other', () => {
    const sample = `[data-theme='a'] { --color-x: #000000; --radius: 4px; }
      [data-theme="b"] { --color-x: #ffffff; --color-shade: rgba(0, 0, 0, 0.1); }`
    expect([...themeColours(sample, 'a')]).toEqual([['x', [0, 0, 0]]])
    expect([...themeColours(sample, 'b')]).toEqual([['x', [255, 255, 255]]])
    expect(() => themeColours(sample, 'c')).toThrow("No [data-theme='c'] block")
  })
})

describe('the holdout theme', () => {
  it.each(SURFACES)('body and secondary text read on %s', (surface) => {
    expect(contrast(colour('foreground'), colour(surface))).toBeGreaterThanOrEqual(TEXT)
    expect(contrast(colour('muted-foreground'), colour(surface))).toBeGreaterThanOrEqual(TEXT)
  })

  it.each(['card', 'popover', 'secondary', 'accent'])('%s has a readable foreground', (surface) => {
    expect(contrast(colour(`${surface}-foreground`), colour(surface))).toBeGreaterThanOrEqual(TEXT)
  })

  it.each(SIGNALS)('%s reads as a fill, hovered or not', (signal) => {
    const label = colour(`${signal}-foreground`)
    expect(contrast(label, colour(signal))).toBeGreaterThanOrEqual(TEXT)
    // `hover:bg-primary/90` and friends let the page show through.
    const hovered = over(colour(signal), 0.9, colour('background'))
    expect(contrast(label, hovered)).toBeGreaterThanOrEqual(TEXT)
  })

  it.each(SIGNALS)('%s reads as text on paper, cards, popovers and muted bands', (signal) => {
    for (const surface of ['background', 'card', 'popover', 'muted']) {
      expect(contrast(colour(signal), colour(surface))).toBeGreaterThanOrEqual(TEXT)
    }
    // A banner tinted with its own colour: `bg-warning/10 text-warning`.
    const tint = over(colour(signal), 0.1, colour('background'))
    expect(contrast(colour(signal), tint)).toBeGreaterThanOrEqual(TEXT)
  })

  it('outlines controls and focus clearly enough to find', () => {
    for (const surface of ['background', 'card']) {
      expect(contrast(colour('input'), colour(surface))).toBeGreaterThanOrEqual(OUTLINE)
      expect(contrast(colour('ring'), colour(surface))).toBeGreaterThanOrEqual(OUTLINE)
    }
  })

  it('keeps cards a step lighter than the page', () => {
    expect(luminance(colour('card'))).toBeGreaterThan(luminance(colour('background')))
    expect(luminance(colour('muted'))).toBeLessThan(luminance(colour('background')))
  })

  it('sets every token the baseline theme sets', () => {
    const baseline = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    const names = [...baseline.matchAll(/^\s*--color-([\w-]+):/gm)].map((match) => match[1])
    expect(names.length).toBeGreaterThan(20)
    const block = /\[data-theme='holdout'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    for (const name of names) expect(block).toContain(`--color-${name}:`)
  })
})
